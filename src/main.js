import { EditorView, basicSetup } from "codemirror";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { FileSync } from "./editor-sync.js";
import { initPet } from "./pet.js";
import { initColorPicker } from "./color-picker.js";
import { buildStandaloneHtml, buildZip, openPrintWindow, downloadBlob } from "./export.js";

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
const linkToggleEl = document.getElementById("link-toggle");
const linkPanelEl = document.getElementById("link-panel");
const linkPanelLabelEl = document.getElementById("link-panel-label");
const linkPanelControlsEl = document.getElementById("link-panel-controls");
const linkTargetEl = document.getElementById("link-target");
const linkModeEl = document.getElementById("link-mode");
const linkTransitionEl = document.getElementById("link-transition");
const linkSaveEl = document.getElementById("link-save");
const linkRemoveEl = document.getElementById("link-remove");
const playToggleEl = document.getElementById("play-toggle");
const playModeEl = document.getElementById("play-mode");
const playStageEl = document.getElementById("play-stage");
const playFrameEl = document.getElementById("play-frame");
const playScreenNameEl = document.getElementById("play-screen-name");
const playBackEl = document.getElementById("play-back");
const playFlashEl = document.getElementById("play-flash");
const playExitEl = document.getElementById("play-exit");
const themeToggleEl = document.getElementById("theme-toggle");
const saveBtnEl = document.getElementById("save-btn");
const autosaveToggleEl = document.getElementById("autosave-toggle");
const newScreenNameEl = document.getElementById("new-screen-name");
const screenCreateEl = document.getElementById("screen-create");
const screenAddErrorEl = document.getElementById("screen-add-error");
const exportToggleEl = document.getElementById("export-toggle");
const exportModalEl = document.getElementById("export-modal");
const exportCloseEl = document.getElementById("export-close");
const exportPagesEl = document.getElementById("export-pages");
const exportPagesAllEl = document.getElementById("export-pages-all");
const exportPagesNoneEl = document.getElementById("export-pages-none");
const exportPrototypeEl = document.getElementById("export-prototype");
const exportCodeEl = document.getElementById("export-code");
const exportPdfEl = document.getElementById("export-pdf");
const exportStatusEl = document.getElementById("export-status");
const projectsToggleEl = document.getElementById("projects-toggle");
const currentProjectEl = document.getElementById("current-project");
const projectsModalEl = document.getElementById("projects-modal");
const projectsCloseEl = document.getElementById("projects-close");
const projectsListEl = document.getElementById("projects-list");
const projectNewNameEl = document.getElementById("project-new-name");
const projectCreateEl = document.getElementById("project-create");
const projectsErrorEl = document.getElementById("projects-error");

let deviceSizes = {};
let currentScreen = null;
let currentScreens = [];
let linksData = { version: 1, links: [] };
let linkMode = false;
let selectedProtoId = null;
let everPlayed = false;
let petCtl = null; // pixel-pet controller (set in main)
let autoSave = localStorage.getItem("codetoui-autosave") !== "off";

// --- Save / auto-save -------------------------------------------------------
function anyDirty() {
  return ["html", "css", "globalCss"].some((k) => syncs[k]?.dirty);
}

function updateSaveIndicator() {
  saveBtnEl.classList.toggle("dirty", anyDirty());
}

async function saveAll() {
  for (const k of ["html", "css", "globalCss"]) {
    if (syncs[k]) await syncs[k].flush();
  }
  updateSaveIndicator();
}

function applyAutosaveLabel() {
  autosaveToggleEl.textContent = `Auto-save: ${autoSave ? "On" : "Off"}`;
  autosaveToggleEl.classList.toggle("active", autoSave);
}

function makeSync(view, saveFn, key, label) {
  return new FileSync({
    view,
    saveFn,
    onConflict: () => showConflictBanner(key, label),
    onDirtyChange: updateSaveIndicator,
    shouldAutoSave: () => autoSave,
  });
}

saveBtnEl.addEventListener("click", saveAll);
autosaveToggleEl.addEventListener("click", () => {
  autoSave = !autoSave;
  localStorage.setItem("codetoui-autosave", autoSave ? "on" : "off");
  applyAutosaveLabel();
  if (autoSave) saveAll(); // flush anything pending when turning it back on
});
window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveAll();
  }
});
applyAutosaveLabel();

// --- Theme (light/dark) -----------------------------------------------------
const THEME_KEY = "codetoui-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggleEl.textContent = theme === "light" ? "☀ Light" : "☾ Dark";
}

themeToggleEl.addEventListener("click", () => {
  const next =
    document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

applyTheme(localStorage.getItem(THEME_KEY) || "dark");
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

// `script` is the JS injected before </body>. Defaults to the live-preview
// bridge; callers pass "" for a static render (overview/popout), or a custom
// script for Link mode and Play mode.
function composeSrcdoc(htmlContent, cssContent, globalCssContent, { script = PREVIEW_BRIDGE_SCRIPT } = {}) {
  const scriptTag = script ? `<script>${script}<\/script>` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>${globalCssContent}</style>
<style>${cssContent}</style>
</head><body>
${htmlContent}
${scriptTag}
</body></html>`;
}

function renderPreview() {
  if (!htmlView || !cssView || !globalCssView) return;
  const htmlContent = htmlView.state.doc.toString();
  const cssContent = cssView.state.doc.toString();
  const globalCssContent = globalCssView.state.doc.toString();
  const opts = linkMode ? { script: buildLinkModeScript() } : undefined;
  previewEl.srcdoc = composeSrcdoc(htmlContent, cssContent, globalCssContent, opts);
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

  if (e.data.type === "select") {
    onLinkSelect(e.data.protoId, e.data.label);
    return;
  }
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
  if (frame) frame.srcdoc = composeSrcdoc(htmlContent, cssContent, globalCssContent, { script: "" });
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

// --- Link mode (authoring) --------------------------------------------------
// Injected into the preview iframe while linking: it outlines already-linked
// elements, highlights on hover, and reports the clicked element's stable id
// to the parent. All selection/target UI lives in the parent frame. Styling
// and highlighting stay INSIDE the iframe so they're immune to the preview's
// transform scaling.

function linkModeScript(linkedIds) {
  return `(function(){
  var LINKED = ${JSON.stringify(linkedIds)};
  var style = document.createElement('style');
  style.textContent = '[data-proto-id]{cursor:pointer}'
    + '[data-proto-linked]{outline:2px solid #5bd98a !important;outline-offset:1px}'
    + '[data-proto-hover]{outline:2px solid #5b8cff !important;outline-offset:1px}';
  document.head.appendChild(style);
  LINKED.forEach(function(id){
    var el = document.querySelector('[data-proto-id="'+id+'"]');
    if (el) el.setAttribute('data-proto-linked','');
  });
  var hovered = null;
  document.addEventListener('mouseover', function(e){
    var el = e.target.closest ? e.target.closest('[data-proto-id]') : null;
    if (hovered && hovered !== el) hovered.removeAttribute('data-proto-hover');
    hovered = el;
    if (hovered) hovered.setAttribute('data-proto-hover','');
  });
  document.addEventListener('click', function(e){
    var el = e.target.closest ? e.target.closest('[data-proto-id]') : null;
    e.preventDefault();
    e.stopPropagation();
    if (!el) return;
    var id = el.getAttribute('data-proto-id');
    var text = (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30);
    var label = el.tagName.toLowerCase() + (text ? ' · ' + text : '');
    window.parent.postMessage({ source: 'proto-preview', type: 'select', protoId: id, label: label }, '*');
  }, true);
  function postSize(){
    var h = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    window.parent.postMessage({ source: 'proto-preview', type: 'size', height: h }, '*');
  }
  window.addEventListener('load', postSize);
  postSize();
})();`;
}

// Special link targets (can't collide with screen names, which are limited to
// [A-Za-z0-9 _-]).
const TARGET_BACK = "$back";
const TARGET_HOME = "$home";

const TRANSITIONS = new Set([
  "instant",
  "dissolve",
  "slide-left",
  "slide-right",
  "slide-up",
  "slide-down",
]);

// Map older/legacy transition values onto the current set.
function normalizeTransition(t) {
  if (TRANSITIONS.has(t)) return t;
  if (t === "none") return "instant";
  if (t === "fade") return "dissolve";
  if (t === "slide") return "slide-left";
  return "instant";
}

function buildLinkModeScript() {
  const linkedIds = linksData.links
    .filter((l) => l.screen === currentScreen)
    .map((l) => l.elementId);
  return linkModeScript(linkedIds);
}

async function persistLinks() {
  linksData = await fetchJson("/api/links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(linksData),
  });
}

function renderLinkTargets() {
  linkTargetEl.innerHTML = "";
  const special = [
    [TARGET_BACK, "← Back"],
    [TARGET_HOME, "⌂ Home (start screen)"],
  ];
  for (const [value, text] of special) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    linkTargetEl.appendChild(opt);
  }
  for (const s of currentScreens) {
    if (s.missing) continue;
    const opt = document.createElement("option");
    opt.value = s.name;
    opt.textContent = s.name;
    linkTargetEl.appendChild(opt);
  }
}

function resetLinkSelection() {
  selectedProtoId = null;
  linkPanelControlsEl.hidden = true;
  linkRemoveEl.hidden = true;
  linkPanelLabelEl.textContent = "Click an element in the preview to link it.";
}

function onLinkSelect(protoId, label) {
  selectedProtoId = protoId;
  linkPanelLabelEl.textContent = `Selected: ${label}`;
  linkPanelControlsEl.hidden = false;
  const existing = linksData.links.find(
    (l) => l.screen === currentScreen && l.elementId === protoId
  );
  if (existing) {
    linkTargetEl.value = existing.target;
    linkModeEl.value = existing.mode === "overlay" ? "overlay" : "navigate";
    linkTransitionEl.value = normalizeTransition(existing.transition);
    linkRemoveEl.hidden = false;
  } else {
    linkModeEl.value = "navigate";
    linkTransitionEl.value = "instant";
    linkRemoveEl.hidden = true;
  }
}

async function saveLink() {
  if (!selectedProtoId) return;
  const id = `${currentScreen}:${selectedProtoId}`;
  const others = linksData.links.filter(
    (l) => !(l.screen === currentScreen && l.elementId === selectedProtoId)
  );
  const target = linkTargetEl.value;
  // Overlay only makes sense for a real destination screen, not Back/Home.
  const mode =
    target === TARGET_BACK || target === TARGET_HOME ? "navigate" : linkModeEl.value;
  linksData.links = [
    ...others,
    {
      id,
      screen: currentScreen,
      elementId: selectedProtoId,
      target,
      mode,
      transition: linkTransitionEl.value,
    },
  ];
  await persistLinks();
  linkRemoveEl.hidden = false;
  renderPreview(); // re-outline linked elements
  petCtl?.react("linkSaved");
}

async function removeLink() {
  if (!selectedProtoId) return;
  linksData.links = linksData.links.filter(
    (l) => !(l.screen === currentScreen && l.elementId === selectedProtoId)
  );
  await persistLinks();
  resetLinkSelection();
  renderPreview();
}

// Linking targets elements by their stable data-proto-id, which is only
// injected when HTML is saved through the app. Push the current HTML through
// the save path once so every element has an id before we start linking.
async function ensureStableIds() {
  const content = htmlView.state.doc.toString();
  const res = await saveScreenFile("html", content);
  if (res?.content && res.content !== content) {
    syncs.html._replaceContent(res.content);
  }
}

async function setLinkMode(on) {
  linkMode = on;
  linkToggleEl.classList.toggle("active", on);
  linkPanelEl.hidden = !on;
  if (on) {
    setOverviewVisible(false);
    await ensureStableIds();
    renderLinkTargets();
    resetLinkSelection();
  }
  renderPreview();
  applyPreviewTransform();
}

linkToggleEl.addEventListener("click", () => setLinkMode(!linkMode));
linkSaveEl.addEventListener("click", saveLink);
linkRemoveEl.addEventListener("click", removeLink);

// --- Play mode (reader) -----------------------------------------------------
// A full-screen runner. Clicking a linked element navigates to its target, or
// opens it as an overlay. The parent owns navigation, history, and the overlay
// stack; each rendered screen carries only the link map for that screen.

let startScreenName = null;
let playBase = null;
let playHistory = [];
let playOverlays = []; // [{ el, frame, screen }], top of stack is last
let playFlash = false;

function screenLinkMap(name) {
  const map = {};
  for (const l of linksData.links) {
    if (l.screen === name) {
      map[l.elementId] = {
        target: l.target,
        transition: normalizeTransition(l.transition),
        mode: l.mode === "overlay" ? "overlay" : "navigate",
      };
    }
  }
  return map;
}

function playModeScript(linkMap, flash) {
  return `(function(){
  var MAP = ${JSON.stringify(linkMap)};
  var FLASH = ${flash ? "true" : "false"};
  Object.keys(MAP).forEach(function(id){
    var el = document.querySelector('[data-proto-id="'+id+'"]');
    if (el) el.style.cursor = 'pointer';
  });
  if (FLASH) {
    var st = document.createElement('style');
    st.textContent = '[data-proto-hotspot]{outline:2px dashed rgba(255,77,157,.9) !important;outline-offset:2px;background:rgba(255,77,157,.12) !important;}';
    document.head.appendChild(st);
    Object.keys(MAP).forEach(function(id){
      var el = document.querySelector('[data-proto-id="'+id+'"]');
      if (el) el.setAttribute('data-proto-hotspot','');
    });
  }
  document.addEventListener('click', function(e){
    var el = e.target.closest ? e.target.closest('[data-proto-id]') : null;
    while (el) {
      var id = el.getAttribute('data-proto-id');
      if (MAP[id]) {
        e.preventDefault();
        window.parent.postMessage({ source: 'proto-play', type: 'navigate', target: MAP[id].target, transition: MAP[id].transition, mode: MAP[id].mode }, '*');
        return;
      }
      el = el.parentElement && el.parentElement.closest ? el.parentElement.closest('[data-proto-id]') : null;
    }
  }, true);
})();`;
}

async function composePlayScreen(name) {
  const { html: htmlContent, css: cssContent } = await fetchJson(`/api/screen/${name}`);
  const globalCssContent = globalCssView.state.doc.toString();
  return composeSrcdoc(htmlContent, cssContent, globalCssContent, {
    script: playModeScript(screenLinkMap(name), playFlash),
  });
}

// Start-of-transition style; the frame animates from here to rest on load.
function transitionStartStyle(transition) {
  switch (transition) {
    case "dissolve":
      return { opacity: "0", transform: "none" };
    case "slide-left":
      return { opacity: "0", transform: "translateX(48px)" };
    case "slide-right":
      return { opacity: "0", transform: "translateX(-48px)" };
    case "slide-up":
      return { opacity: "0", transform: "translateY(48px)" };
    case "slide-down":
      return { opacity: "0", transform: "translateY(-48px)" };
    default: // instant
      return { opacity: "1", transform: "none" };
  }
}

function animateFrameIn(frame, transition) {
  const start = transitionStartStyle(transition);
  frame.style.transition = "none";
  frame.style.opacity = start.opacity;
  frame.style.transform = start.transform;
  frame.onload = () => {
    frame.style.transition = "opacity 180ms ease, transform 180ms ease";
    frame.style.opacity = "1";
    frame.style.transform = "none";
  };
}

function updateBackButton() {
  playBackEl.disabled = playOverlays.length === 0 && playHistory.length === 0;
}

async function renderBase(name, transition) {
  playBase = name;
  playScreenNameEl.textContent = name;
  animateFrameIn(playFrameEl, transition);
  playFrameEl.srcdoc = await composePlayScreen(name);
  updateBackButton();
}

async function openOverlay(name, transition) {
  const el = document.createElement("div");
  el.className = "play-overlay";
  const frame = document.createElement("iframe");
  frame.className = "play-overlay-frame";
  frame.setAttribute("sandbox", "allow-scripts");
  el.appendChild(frame);
  // Click on the dim backdrop (outside the frame) closes this overlay.
  el.addEventListener("click", (e) => {
    if (e.target === el) closeTopOverlay();
  });
  playStageEl.appendChild(el);
  playOverlays.push({ el, frame, screen: name });
  animateFrameIn(frame, transition === "instant" ? "dissolve" : transition);
  frame.srcdoc = await composePlayScreen(name);
  updateBackButton();
}

function closeTopOverlay() {
  const top = playOverlays.pop();
  if (top) top.el.remove();
  updateBackButton();
}

function closeAllOverlays() {
  for (const o of playOverlays) o.el.remove();
  playOverlays = [];
}

async function playNavigate({ target, transition, mode }) {
  transition = normalizeTransition(transition);
  if (target === TARGET_BACK) {
    playBack();
    return;
  }
  if (target === TARGET_HOME) {
    closeAllOverlays();
    if (playBase && playBase !== startScreenName) playHistory.push(playBase);
    await renderBase(startScreenName, transition);
    return;
  }
  if (mode === "overlay") {
    await openOverlay(target, transition);
    return;
  }
  closeAllOverlays();
  if (playBase) playHistory.push(playBase);
  await renderBase(target, transition);
}

function playBack() {
  if (playOverlays.length > 0) {
    closeTopOverlay();
    return;
  }
  if (playHistory.length === 0) return;
  renderBase(playHistory.pop(), "dissolve");
}

async function enterPlayMode(startScreen) {
  everPlayed = true;
  playHistory = [];
  closeAllOverlays();
  playModeEl.hidden = false;
  await renderBase(startScreen, "instant");
}

function exitPlayMode() {
  closeAllOverlays();
  playModeEl.hidden = true;
  playFrameEl.srcdoc = "";
  playBase = null;
}

async function toggleFlash() {
  playFlash = !playFlash;
  playFlashEl.classList.toggle("active", playFlash);
  // Re-render the base and any overlays in place (no entrance animation).
  playFrameEl.style.transition = "none";
  playFrameEl.srcdoc = await composePlayScreen(playBase);
  for (const o of playOverlays) o.frame.srcdoc = await composePlayScreen(o.screen);
}

playToggleEl.addEventListener("click", () => {
  if (currentScreen) enterPlayMode(currentScreen);
});
playBackEl.addEventListener("click", playBack);
playExitEl.addEventListener("click", exitPlayMode);
playFlashEl.addEventListener("click", toggleFlash);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !playModeEl.hidden) exitPlayMode();
});

window.addEventListener("message", (e) => {
  if (e.data?.source !== "proto-play" || e.data.type !== "navigate") return;
  if (playModeEl.hidden || !e.data.target) return;
  playNavigate({ target: e.data.target, transition: e.data.transition, mode: e.data.mode });
});

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
    li.classList.toggle("active", s.name === currentScreen);
    li.classList.toggle("missing", s.missing);

    const nm = document.createElement("span");
    nm.className = "screen-name-label";
    nm.textContent = s.name + (s.missing ? " (missing)" : "");
    nm.onclick = () => {
      if (s.missing || s.name === currentScreen) return;
      loadScreen(s.name).then(() => renderSidebar(currentScreens));
    };
    li.appendChild(nm);

    if (screens.length > 1 && !s.missing) {
      const del = document.createElement("button");
      del.className = "screen-del";
      del.textContent = "×";
      del.title = "Delete page";
      del.onclick = (e) => {
        e.stopPropagation();
        deleteScreenAction(s.name);
      };
      li.appendChild(del);
    }
    screenListEl.appendChild(li);
  }
}

// --- Add / delete pages -----------------------------------------------------
async function createScreenAction() {
  const name = newScreenNameEl.value.trim();
  if (!name) return;
  const res = await fetch("/api/screens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    screenAddErrorEl.textContent = await res.text();
    screenAddErrorEl.hidden = false;
    return;
  }
  const { screens } = await res.json();
  newScreenNameEl.value = "";
  screenAddErrorEl.hidden = true;
  currentScreens = screens;
  await loadScreen(name);
  renderSidebar(screens);
  petCtl?.react("screenAdded");
}

async function deleteScreenAction(name) {
  if (!confirm(`Delete page "${name}"? This removes its files and any links to/from it.`)) return;
  const res = await fetch(`/api/screens/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok) {
    alert(await res.text());
    return;
  }
  const { config, screens } = await res.json();
  startScreenName = config.startScreen;
  currentScreens = screens;
  linksData = await fetchJson("/api/links"); // server pruned affected links
  if (currentScreen === name) {
    await loadScreen(config.startScreen);
  }
  renderSidebar(screens);
}

screenCreateEl.addEventListener("click", createScreenAction);
newScreenNameEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") createScreenAction();
});

// --- Export -----------------------------------------------------------------
function projectSlug() {
  return (currentProjectEl.textContent || "project").trim().replace(/[^A-Za-z0-9_-]+/g, "-") || "project";
}

function selectedPages() {
  return [...exportPagesEl.querySelectorAll("input:checked")].map((c) => c.value);
}

function exportStatus(msg) {
  exportStatusEl.textContent = msg;
  exportStatusEl.hidden = false;
}

async function fetchScreensContent(names) {
  const out = [];
  for (const name of names) {
    const { html: h, css: c } = await fetchJson(`/api/screen/${encodeURIComponent(name)}`);
    out.push({ name, html: h, css: c });
  }
  return out;
}

function renderExportPages() {
  exportPagesEl.innerHTML = "";
  for (const s of currentScreens) {
    if (s.missing) continue;
    const lab = document.createElement("label");
    lab.className = "export-page";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = s.name;
    cb.checked = true;
    lab.append(cb, document.createTextNode(s.name));
    exportPagesEl.appendChild(lab);
  }
}

function openExport() {
  exportStatusEl.hidden = true;
  renderExportPages();
  exportModalEl.hidden = false;
}

exportToggleEl.addEventListener("click", openExport);
exportCloseEl.addEventListener("click", () => (exportModalEl.hidden = true));
exportModalEl.addEventListener("click", (e) => {
  if (e.target === exportModalEl) exportModalEl.hidden = true;
});
exportPagesAllEl.addEventListener("click", () =>
  exportPagesEl.querySelectorAll("input").forEach((c) => (c.checked = true))
);
exportPagesNoneEl.addEventListener("click", () =>
  exportPagesEl.querySelectorAll("input").forEach((c) => (c.checked = false))
);

exportPrototypeEl.addEventListener("click", async () => {
  const names = selectedPages();
  if (!names.length) return exportStatus("Pick at least one page.");
  await saveAll();
  const screens = await fetchScreensContent(names);
  const start = names.includes(startScreenName) ? startScreenName : names[0];
  const html = buildStandaloneHtml({
    screens,
    globalCss: globalCssView.state.doc.toString(),
    links: linksData.links.filter((l) => names.includes(l.screen)),
    startScreen: start,
    title: currentProjectEl.textContent,
  });
  downloadBlob(new Blob([html], { type: "text/html" }), `${projectSlug()}-prototype.html`);
  exportStatus("Prototype exported ✓");
});

exportCodeEl.addEventListener("click", async () => {
  const names = selectedPages();
  if (!names.length) return exportStatus("Pick at least one page.");
  await saveAll();
  const screens = await fetchScreensContent(names);
  const files = [{ path: "global.css", content: globalCssView.state.doc.toString() }];
  for (const s of screens) {
    files.push({ path: `screens/${s.name}/${s.name}.html`, content: s.html });
    files.push({ path: `screens/${s.name}/${s.name}.css`, content: s.css });
  }
  files.push({ path: "links.json", content: JSON.stringify(linksData, null, 2) });
  const zip = buildZip(files);
  downloadBlob(new Blob([zip], { type: "application/zip" }), `${projectSlug()}-code.zip`);
  exportStatus("Code exported ✓");
});

exportPdfEl.addEventListener("click", async () => {
  const names = selectedPages();
  if (!names.length) return exportStatus("Pick at least one page.");
  await saveAll();
  const screens = await fetchScreensContent(names);
  const ok = openPrintWindow({
    screens,
    globalCss: globalCssView.state.doc.toString(),
    deviceWidth: currentDeviceWidth, // selected mobile/tablet/desktop (null = Full)
    title: currentProjectEl.textContent,
  });
  exportStatus(ok ? "Opened print view — choose 'Save as PDF'." : "Popup blocked — allow popups and retry.");
});

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
    iframe.srcdoc = composeSrcdoc(htmlContent, cssContent, globalCssContent, { script: "" });

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

  syncs.html = makeSync(htmlView, (content) => saveScreenFile("html", content), "html", "HTML");
  syncs.css = makeSync(cssView, (content) => saveScreenFile("css", content), "css", "CSS");

  if (linkMode) resetLinkSelection();
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

// --- Project management -----------------------------------------------------
// Switching the active project re-points the whole backend, so the simplest
// correct way to adopt the new project is a full reload rather than surgically
// swapping every bit of in-memory state.

function showProjectsError(msg) {
  projectsErrorEl.textContent = msg;
  projectsErrorEl.hidden = false;
}

async function refreshProjectsList() {
  const data = await fetchJson("/api/projects");
  currentProjectEl.textContent = data.active || "—";
  projectsListEl.innerHTML = "";
  for (const name of data.projects) {
    const li = document.createElement("li");
    const isActive = name === data.active;
    if (isActive) li.classList.add("active");

    const nm = document.createElement("span");
    nm.className = "proj-name";
    nm.textContent = name;
    li.appendChild(nm);

    if (isActive) {
      const badge = document.createElement("span");
      badge.className = "proj-badge";
      badge.textContent = "Active";
      li.appendChild(badge);
    } else {
      const openBtn = document.createElement("button");
      openBtn.className = "topbar-btn";
      openBtn.textContent = "Open";
      openBtn.onclick = () => switchProject(name);
      li.appendChild(openBtn);

      if (data.projects.length > 1) {
        const delBtn = document.createElement("button");
        delBtn.className = "topbar-btn";
        delBtn.textContent = "Delete";
        delBtn.onclick = () => deleteProjectConfirm(name);
        li.appendChild(delBtn);
      }
    }
    projectsListEl.appendChild(li);
  }
}

async function openProjects() {
  projectsErrorEl.hidden = true;
  await refreshProjectsList();
  projectsModalEl.hidden = false;
  projectNewNameEl.focus();
}

function closeProjects() {
  projectsModalEl.hidden = true;
}

async function switchProject(name) {
  await fetchJson("/api/projects/active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  location.reload();
}

async function createProject() {
  const name = projectNewNameEl.value.trim();
  if (!name) return;
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    showProjectsError(await res.text());
    return;
  }
  projectNewNameEl.value = "";
  projectsErrorEl.hidden = true;
  await refreshProjectsList();
}

async function deleteProjectConfirm(name) {
  if (!confirm(`Delete project "${name}"? This permanently removes its files.`)) return;
  const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!res.ok) {
    showProjectsError(await res.text());
    return;
  }
  await refreshProjectsList();
}

projectsToggleEl.addEventListener("click", openProjects);
projectsCloseEl.addEventListener("click", closeProjects);
projectCreateEl.addEventListener("click", createProject);
projectNewNameEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") createProject();
});
projectsModalEl.addEventListener("click", (e) => {
  if (e.target === projectsModalEl) closeProjects();
});

async function main() {
  setupTabs();
  petCtl = initPet({
    getContext: () => ({
      screenCount: currentScreens.filter((s) => !s.missing).length,
      linkCount: linksData.links.length,
      everPlayed,
      linkMode,
    }),
  });
  initColorPicker();

  const { config, screens, globalCss: globalCssContent, wsPort, activeProject } =
    await fetchJson("/api/project");
  currentProjectEl.textContent = activeProject || "—";
  deviceSizes = config.deviceSizes || {};
  renderDeviceSwitcher();

  linksData = await fetchJson("/api/links");

  globalCssView = makeEditorView(
    document.getElementById("editor-globalCss"),
    css,
    globalCssContent,
    () => {
      syncs.globalCss.markDirtyAndScheduleSave();
      scheduleRender();
    }
  );
  syncs.globalCss = makeSync(globalCssView, (content) => saveGlobalCss(content), "globalCss", "Global CSS");

  const startScreen = config.startScreen || screens[0]?.name;
  startScreenName = startScreen;
  await loadScreen(startScreen);
  renderSidebar(screens);

  connectWebSocket(wsPort);
}

main();
