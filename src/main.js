import { EditorView, basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { FileSync } from "./editor-sync.js";

const statusEl = document.getElementById("sync-status");
const bannerEl = document.getElementById("conflict-banner");
const previewEl = document.getElementById("preview");
const previewFrameEl = document.getElementById("preview-frame");
const previewStageEl = document.getElementById("preview-stage");
const screenNameEl = document.getElementById("screen-name");
const screenListEl = document.getElementById("screen-list");
const deviceSwitcherEl = document.getElementById("device-switcher");
const overviewToggleEl = document.getElementById("overview-toggle");
const overviewBoardEl = document.getElementById("overview-board");
const layoutEl = document.getElementById("layout");
const editorToggleEl = document.getElementById("editor-toggle");
const editorPaneEl = document.querySelector(".editor-pane");
const popoutToggleEl = document.getElementById("popout-toggle");
const popoutReturnEl = document.getElementById("popout-return");
const previewNoteEl = document.getElementById("preview-popout-note");
const panOverlayEl = document.getElementById("preview-pan-overlay");
const panToggleEl = document.getElementById("pan-toggle");
const zoomInEl = document.getElementById("zoom-in");
const zoomOutEl = document.getElementById("zoom-out");

let deviceSizes = {};
let currentScreen = null;
let currentScreens = [];
let htmlView = null;
let cssView = null;
let globalCssView = null;
const syncs = {}; // 'html' | 'css' | 'globalCss' -> FileSync

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

function saveScreenFile(file, content) {
  return fetchJson(`/api/screen/${currentScreen}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, content }),
  });
}

function saveGlobalCss(content) {
  return fetchJson("/api/global-css", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

// The preview renders inside a sandboxed iframe, a separate browsing context:
// wheel events over it never bubble up to the parent page, and the parent
// can't read the iframe's content size across the sandbox boundary. This
// bridge relays both out via postMessage so (a) ctrl/pinch zoom and plain
// wheel panning work while the cursor is over the rendered content, and
// (b) the parent can size the preview frame to the real content height.
const PREVIEW_BRIDGE_SCRIPT = `
(function () {
  function postSize() {
    var h = Math.max(
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0
    );
    window.parent.postMessage({ source: 'proto-preview', type: 'size', height: h }, '*');
  }
  window.addEventListener('load', postSize);
  window.addEventListener('wheel', function (e) {
    e.preventDefault();
    window.parent.postMessage({ source: 'proto-preview', type: 'wheel', ctrlKey: e.ctrlKey, deltaX: e.deltaX, deltaY: e.deltaY }, '*');
  }, { passive: false });
  if (window.ResizeObserver && document.body) {
    new ResizeObserver(postSize).observe(document.body);
  }
  postSize();
})();
`;

function composeSrcdoc(htmlContent, cssContent, globalCssContent, { bridge = true } = {}) {
  const bridgeTag = bridge ? `<script>${PREVIEW_BRIDGE_SCRIPT}<\/script>` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>${globalCssContent}</style>
<style>${cssContent}</style>
</head><body>
${htmlContent}
${bridgeTag}
</body></html>`;
}

function renderPreview() {
  if (!htmlView || !cssView || !globalCssView) return;
  const htmlContent = htmlView.state.doc.toString();
  const cssContent = cssView.state.doc.toString();
  const globalCssContent = globalCssView.state.doc.toString();
  previewEl.srcdoc = composeSrcdoc(htmlContent, cssContent, globalCssContent);
  // The new document will re-report its height via the bridge; until then fall
  // back to the pane height so the frame isn't left at a stale size.
  previewContentHeight = 0;
  if (previewWindow && !previewWindow.closed) {
    updatePopoutContent(htmlContent, cssContent, globalCssContent);
  }
}

const RENDER_DEBOUNCE_MS = 500;
let renderTimer = null;
function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, RENDER_DEBOUNCE_MS);
}

function showConflictBanner(key, label) {
  bannerEl.hidden = false;
  bannerEl.innerHTML = "";
  const msg = document.createElement("span");
  msg.textContent = `${label} changed on disk while you were editing.`;
  const keepBtn = document.createElement("button");
  keepBtn.textContent = "Keep mine";
  keepBtn.onclick = () => {
    syncs[key].keepLocal();
    bannerEl.hidden = true;
  };
  const loadBtn = document.createElement("button");
  loadBtn.textContent = "Load theirs";
  loadBtn.onclick = () => {
    syncs[key].acceptExternal();
    scheduleRender();
    bannerEl.hidden = true;
  };
  bannerEl.append(msg, keepBtn, loadBtn);
}

function makeEditorView(container, lang, doc, onDocChanged) {
  return new EditorView({
    doc,
    extensions: [
      basicSetup,
      lang(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onDocChanged();
      }),
    ],
    parent: container,
  });
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      document.getElementById("editor-html").hidden = target !== "html";
      document.getElementById("editor-css").hidden = target !== "css";
      document.getElementById("editor-globalCss").hidden = target !== "globalCss";
    });
  });
}

const previewScrollEl = document.getElementById("preview-scroll");
let currentDeviceWidth = null; // null = "Full": base width tracks the pane's own width
let zoomLevel = 1;
let previewContentHeight = 0; // measured from the iframe via the bridge; 0 = not yet known

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;

/**
 * Lays out the preview as a device frame inside a scroll viewport.
 *
 *   baseWidth  = the chosen device width (or the pane width for "Full")
 *   baseHeight = the real content height reported by the iframe bridge
 *   fitScale   = shrink-to-fit so the device width fits the pane (never >1)
 *   z          = fitScale * user zoom
 *
 * The frame is sized to the real device dimensions and visually scaled by z;
 * the stage is sized to the POST-scale dimensions so it, not the frame, drives
 * the pane's scrollable area. That's what makes panning work: zoom in and the
 * stage grows past the pane, so the pane scrollbars (and wheel/trackpad) pan
 * over it. Each device fits independently, so the preview width always stays
 * constrained to the chosen device size.
 */
function applyPreviewTransform() {
  const paneW = previewScrollEl.clientWidth;
  const paneH = previewScrollEl.clientHeight;
  const baseWidth = currentDeviceWidth || paneW;
  const baseHeight = previewContentHeight || paneH;
  const fitScale = Math.min(1, paneW / baseWidth);
  const z = fitScale * zoomLevel;

  previewFrameEl.style.width = `${baseWidth}px`;
  previewFrameEl.style.height = `${baseHeight}px`;
  previewFrameEl.style.transform = `scale(${z})`;
  previewStageEl.style.width = `${baseWidth * z}px`;
  previewStageEl.style.height = `${baseHeight * z}px`;
}

function applyDeviceWidth(width) {
  currentDeviceWidth = width;
  zoomLevel = 1;
  applyPreviewTransform();
}

window.addEventListener("resize", applyPreviewTransform);

function zoomByWheelDelta(deltaY) {
  const factor = Math.exp(-deltaY * 0.01);
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomLevel * factor));
  applyPreviewTransform();
}

// Ctrl+wheel (or a trackpad pinch, reported as ctrlKey wheel events) zooms;
// plain wheel pans via the pane's native scroll. This listener only catches
// events over the letterboxed margin -- events over the iframe itself come in
// through the postMessage bridge below.
previewScrollEl.addEventListener(
  "wheel",
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomByWheelDelta(e.deltaY);
  },
  { passive: false }
);

window.addEventListener("message", (e) => {
  if (e.data?.source !== "proto-preview") return;
  // Only the live preview iframe drives zoom/pan/size -- ignore any messages
  // from other iframes (overview thumbnails don't carry the bridge, but guard
  // anyway so a stray sender can never resize or pan the live preview).
  if (e.source !== previewEl.contentWindow) return;

  if (e.data.type === "size") {
    if (typeof e.data.height === "number" && e.data.height > 0) {
      previewContentHeight = e.data.height;
      applyPreviewTransform();
    }
    return;
  }
  if (e.data.type === "wheel") {
    if (e.data.ctrlKey) {
      zoomByWheelDelta(e.data.deltaY);
    } else {
      previewScrollEl.scrollBy({ left: e.data.deltaX, top: e.data.deltaY });
    }
  }
});

// --- Editor show/hide -------------------------------------------------------

let editorVisible = true;

function setEditorVisible(visible) {
  editorVisible = visible;
  editorPaneEl.hidden = !visible;
  layoutEl.classList.toggle("editor-hidden", !visible);
  editorToggleEl.textContent = visible ? "Hide code" : "Show code";
  editorToggleEl.classList.toggle("active", !visible);
  // Pane width changed, so the fit-to-pane scale needs recomputing.
  applyPreviewTransform();
}

editorToggleEl.addEventListener("click", () => setEditorVisible(!editorVisible));

// --- Preview pop-out window -------------------------------------------------
// The popped-out window shows a plain, responsive copy of the preview (no
// device framing or zoom/pan -- resize the OS window instead). It stays in
// sync because renderPreview() pushes new content to it on every change. We
// use the no-bridge srcdoc so native scrolling works inside the popup.

let previewWindow = null;
let popoutPoll = null;
const POPOUT_FRAME_ID = "proto-popout-frame";

function updatePopoutContent(htmlContent, cssContent, globalCssContent) {
  if (!previewWindow || previewWindow.closed) return;
  const frame = previewWindow.document.getElementById(POPOUT_FRAME_ID);
  if (frame) frame.srcdoc = composeSrcdoc(htmlContent, cssContent, globalCssContent, { bridge: false });
  previewWindow.document.title = `${currentScreen} — Preview`;
}

function openPreviewPopout() {
  previewWindow = window.open("", "proto-preview", "width=500,height=820");
  if (!previewWindow) {
    // Blocked by a popup blocker -- leave everything as-is.
    previewWindow = null;
    return;
  }
  previewWindow.document.open();
  previewWindow.document.write(
    `<!doctype html><html><head><meta charset="utf-8" /><title>Preview</title>` +
      `<style>html,body{margin:0;height:100%;background:#06070a}` +
      `iframe{border:0;width:100%;height:100%;display:block;background:#0f1115}</style>` +
      `</head><body><iframe id="${POPOUT_FRAME_ID}" sandbox="allow-scripts"></iframe></body></html>`
  );
  previewWindow.document.close();

  setPreviewPoppedOut(true);
  renderPreview(); // pushes current content into the new window

  // Detect the user closing the window directly, so we can pop it back in.
  if (popoutPoll) clearInterval(popoutPoll);
  popoutPoll = setInterval(() => {
    if (previewWindow && previewWindow.closed) closePreviewPopout();
  }, 500);
}

function closePreviewPopout() {
  if (popoutPoll) {
    clearInterval(popoutPoll);
    popoutPoll = null;
  }
  if (previewWindow && !previewWindow.closed) previewWindow.close();
  previewWindow = null;
  setPreviewPoppedOut(false);
  // The inline iframe was display:none while popped out, so it never reported
  // a real height. Re-render it now that it's visible: the fresh load makes
  // the bridge re-measure, and applyPreviewTransform handles the interim.
  renderPreview();
  applyPreviewTransform();
}

function setPreviewPoppedOut(poppedOut) {
  previewStageEl.hidden = poppedOut;
  previewNoteEl.hidden = !poppedOut;
  popoutToggleEl.textContent = poppedOut ? "Pop back in" : "Pop out";
  popoutToggleEl.classList.toggle("active", poppedOut);
}

popoutToggleEl.addEventListener("click", () => {
  if (previewWindow && !previewWindow.closed) closePreviewPopout();
  else openPreviewPopout();
});
popoutReturnEl.addEventListener("click", closePreviewPopout);

// Don't orphan the popup if the app tab is closed/reloaded.
window.addEventListener("beforeunload", () => {
  if (previewWindow && !previewWindow.closed) previewWindow.close();
});

// --- Zoom buttons + drag-to-pan ---------------------------------------------

const ZOOM_STEP = 1.2;

function zoomByFactor(factor) {
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomLevel * factor));
  applyPreviewTransform();
}

zoomInEl.addEventListener("click", () => zoomByFactor(ZOOM_STEP));
zoomOutEl.addEventListener("click", () => zoomByFactor(1 / ZOOM_STEP));

let panMode = false;

function setPanMode(on) {
  panMode = on;
  panOverlayEl.hidden = !on;
  panToggleEl.classList.toggle("active", on);
}

panToggleEl.addEventListener("click", () => setPanMode(!panMode));

let panning = false;
let panLastX = 0;
let panLastY = 0;

panOverlayEl.addEventListener("pointerdown", (e) => {
  panning = true;
  panLastX = e.clientX;
  panLastY = e.clientY;
  panOverlayEl.setPointerCapture(e.pointerId);
  panOverlayEl.classList.add("grabbing");
});

panOverlayEl.addEventListener("pointermove", (e) => {
  if (!panning) return;
  // Drag the content: move the scroll position opposite the pointer.
  previewScrollEl.scrollBy({ left: panLastX - e.clientX, top: panLastY - e.clientY });
  panLastX = e.clientX;
  panLastY = e.clientY;
});

function endPan(e) {
  if (!panning) return;
  panning = false;
  panOverlayEl.classList.remove("grabbing");
  if (e?.pointerId != null && panOverlayEl.hasPointerCapture?.(e.pointerId)) {
    panOverlayEl.releasePointerCapture(e.pointerId);
  }
}

panOverlayEl.addEventListener("pointerup", endPan);
panOverlayEl.addEventListener("pointercancel", endPan);

function renderDeviceSwitcher() {
  deviceSwitcherEl.innerHTML = "";
  const makeBtn = (label, width) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.onclick = () => {
      deviceSwitcherEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyDeviceWidth(width);
    };
    return btn;
  };
  const fullBtn = makeBtn("Full", null);
  fullBtn.classList.add("active");
  deviceSwitcherEl.appendChild(fullBtn);
  for (const [name, width] of Object.entries(deviceSizes)) {
    deviceSwitcherEl.appendChild(makeBtn(`${name} (${width})`, width));
  }
}

function renderSidebar(screens) {
  currentScreens = screens;
  screenListEl.innerHTML = "";
  for (const s of screens) {
    const li = document.createElement("li");
    li.textContent = s.name + (s.missing ? " (missing)" : "");
    li.classList.toggle("active", s.name === currentScreen);
    li.classList.toggle("missing", s.missing);
    li.onclick = () => {
      if (s.missing) return;
      if (s.name === currentScreen) return;
      loadScreen(s.name).then(() => renderSidebar(screens));
    };
    screenListEl.appendChild(li);
  }
}

const OVERVIEW_REFERENCE_WIDTH = 1280;
const OVERVIEW_THUMB_WIDTH = 280;
const OVERVIEW_THUMB_HEIGHT = 200;
const OVERVIEW_SCALE = OVERVIEW_THUMB_WIDTH / OVERVIEW_REFERENCE_WIDTH;

async function renderOverview() {
  overviewBoardEl.innerHTML = "";
  const globalCssContent = globalCssView.state.doc.toString();

  for (const s of currentScreens) {
    if (s.missing) continue;
    const { html: htmlContent, css: cssContent } = await fetchJson(`/api/screen/${s.name}`);

    const card = document.createElement("div");
    card.className = "overview-card";

    const label = document.createElement("div");
    label.className = "overview-card-label";
    label.textContent = s.name;

    const box = document.createElement("div");
    box.className = "overview-thumb-box";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.width = `${OVERVIEW_REFERENCE_WIDTH}px`;
    iframe.style.height = `${OVERVIEW_THUMB_HEIGHT / OVERVIEW_SCALE}px`;
    iframe.style.transformOrigin = "top left";
    iframe.style.transform = `scale(${OVERVIEW_SCALE})`;
    iframe.srcdoc = composeSrcdoc(htmlContent, cssContent, globalCssContent, { bridge: false });

    box.appendChild(iframe);
    card.append(label, box);
    card.onclick = () => {
      setOverviewVisible(false);
      loadScreen(s.name).then(() => renderSidebar(currentScreens));
    };
    overviewBoardEl.appendChild(card);
  }
}

function setOverviewVisible(visible) {
  overviewBoardEl.hidden = !visible;
  layoutEl.hidden = visible;
  overviewToggleEl.classList.toggle("active", visible);
}

overviewToggleEl.addEventListener("click", () => {
  const show = overviewBoardEl.hidden;
  if (show) renderOverview();
  setOverviewVisible(show);
});

async function loadScreen(name) {
  if (syncs.html) await syncs.html.flush();
  if (syncs.css) await syncs.css.flush();

  currentScreen = name;
  screenNameEl.textContent = name;

  const { html: htmlContent, css: cssContent } = await fetchJson(`/api/screen/${name}`);

  if (htmlView) htmlView.destroy();
  if (cssView) cssView.destroy();

  htmlView = makeEditorView(document.getElementById("editor-html"), html, htmlContent, () => {
    syncs.html.markDirtyAndScheduleSave();
    scheduleRender();
  });
  cssView = makeEditorView(document.getElementById("editor-css"), css, cssContent, () => {
    syncs.css.markDirtyAndScheduleSave();
    scheduleRender();
  });

  syncs.html = new FileSync({
    view: htmlView,
    saveFn: (content) => saveScreenFile("html", content),
    onConflict: () => showConflictBanner("html", "HTML"),
  });
  syncs.css = new FileSync({
    view: cssView,
    saveFn: (content) => saveScreenFile("css", content),
    onConflict: () => showConflictBanner("css", "CSS"),
  });

  renderPreview();
  applyPreviewTransform();
}

function connectWebSocket(wsPort) {
  const ws = new WebSocket(`ws://${location.hostname}:${wsPort}/`);

  ws.onopen = () => {
    statusEl.textContent = "connected";
    statusEl.className = "status connected";
  };
  ws.onclose = () => {
    statusEl.textContent = "disconnected";
    statusEl.className = "status disconnected";
  };
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type !== "externalChange") return;

    if (msg.file === "globalCss") {
      syncs.globalCss.handleExternalChange(msg.content);
      scheduleRender();
      return;
    }
    if (msg.screen === currentScreen) {
      syncs[msg.file].handleExternalChange(msg.content);
      scheduleRender();
    }
  };
}

async function main() {
  setupTabs();

  const { config, screens, globalCss: globalCssContent, wsPort } = await fetchJson("/api/project");
  deviceSizes = config.deviceSizes || {};
  renderDeviceSwitcher();

  globalCssView = makeEditorView(
    document.getElementById("editor-globalCss"),
    css,
    globalCssContent,
    () => {
      syncs.globalCss.markDirtyAndScheduleSave();
      scheduleRender();
    }
  );
  syncs.globalCss = new FileSync({
    view: globalCssView,
    saveFn: (content) => saveGlobalCss(content),
    onConflict: () => showConflictBanner("globalCss", "Global CSS"),
  });

  const startScreen = config.startScreen || screens[0]?.name;
  await loadScreen(startScreen);
  renderSidebar(screens);

  connectWebSocket(wsPort);
}

main();
