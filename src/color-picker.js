// A Windows-style color picker (SV square + vertical hue bar) with RGB/HEX
// fields and a two-stop linear-gradient builder. Values copy to the clipboard
// so you can paste them straight into your CSS. Styled to match the pixel theme.

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

const hx = (n) => n.toString(16).padStart(2, "0");
const rgbToHex = (r, g, b) => `#${hx(r)}${hx(g)}${hx(b)}`;

function hexToRgb(hex) {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));

export function initColorPicker() {
  const modal = document.getElementById("color-modal");
  if (!modal) return;

  const el = (id) => document.getElementById(id);
  const toggleBtn = el("color-toggle");
  const closeBtn = el("color-close");
  const svEl = el("color-sv");
  const svThumb = el("color-sv-thumb");
  const hueEl = el("color-hue");
  const hueThumb = el("color-hue-thumb");
  const swatchEl = el("color-swatch");
  const rEl = el("color-r");
  const gEl = el("color-g");
  const bEl = el("color-b");
  const hexEl = el("color-hex");
  const modeSolidBtn = el("color-mode-solid");
  const modeGradientBtn = el("color-mode-gradient");
  const gradientEl = el("color-gradient");
  const stopABtn = el("color-stop-a");
  const stopBBtn = el("color-stop-b");
  const angleEl = el("color-angle");
  const gradPreviewEl = el("color-grad-preview");
  const copyHexBtn = el("color-copy-hex");
  const copyRgbBtn = el("color-copy-rgb");
  const copyGradBtn = el("color-copy-grad");
  const copiedEl = el("color-copied");

  let hsv = { h: 335, s: 0.7, v: 1 }; // current editing color
  let mode = "solid";
  let stops = { a: "#ff4d9d", b: "#38f9d7" };
  let activeStop = "a";

  function currentRgb() {
    return hsvToRgb(hsv.h, hsv.s, hsv.v);
  }
  function currentHex() {
    const { r, g, b } = currentRgb();
    return rgbToHex(r, g, b);
  }
  function gradientValue() {
    return `linear-gradient(${angleEl.value || 0}deg, ${stops.a}, ${stops.b})`;
  }

  function sync() {
    const { r, g, b } = currentRgb();
    const hex = rgbToHex(r, g, b);

    // SV square's hue layer + swatch
    const hueRgb = hsvToRgb(hsv.h, 1, 1);
    svEl.style.backgroundImage =
      `linear-gradient(to top, #000, rgba(0,0,0,0)),` +
      `linear-gradient(to right, #fff, rgb(${hueRgb.r},${hueRgb.g},${hueRgb.b}))`;
    swatchEl.style.background = hex;

    // thumbs
    svThumb.style.left = `${hsv.s * 100}%`;
    svThumb.style.top = `${(1 - hsv.v) * 100}%`;
    hueThumb.style.top = `${(hsv.h / 360) * 100}%`;

    // fields (don't clobber a field the user is typing in)
    if (document.activeElement !== rEl) rEl.value = r;
    if (document.activeElement !== gEl) gEl.value = g;
    if (document.activeElement !== bEl) bEl.value = b;
    if (document.activeElement !== hexEl) hexEl.value = hex;

    if (mode === "gradient") {
      stops[activeStop] = hex;
      stopABtn.style.borderColor = stops.a;
      stopBBtn.style.borderColor = stops.b;
      gradPreviewEl.style.background = gradientValue();
    }
  }

  function setHsv(next) {
    hsv = next;
    sync();
  }
  function setRgb(r, g, b) {
    setHsv(rgbToHsv(r, g, b));
  }

  // --- SV square + hue bar dragging ---
  function dragHandler(target, onMove) {
    const move = (e) => {
      const rect = target.getBoundingClientRect();
      onMove(
        clamp01((e.clientX - rect.left) / rect.width),
        clamp01((e.clientY - rect.top) / rect.height)
      );
    };
    target.addEventListener("pointerdown", (e) => {
      target.setPointerCapture(e.pointerId);
      move(e);
      const onPointerMove = (ev) => move(ev);
      const onUp = (ev) => {
        target.releasePointerCapture?.(ev.pointerId);
        target.removeEventListener("pointermove", onPointerMove);
        target.removeEventListener("pointerup", onUp);
      };
      target.addEventListener("pointermove", onPointerMove);
      target.addEventListener("pointerup", onUp);
    });
  }

  dragHandler(svEl, (x, y) => setHsv({ h: hsv.h, s: x, v: 1 - y }));
  dragHandler(hueEl, (_x, y) => setHsv({ h: y * 360, s: hsv.s, v: hsv.v }));

  // --- numeric fields ---
  function readRgbFields() {
    const r = Math.min(255, Math.max(0, parseInt(rEl.value, 10) || 0));
    const g = Math.min(255, Math.max(0, parseInt(gEl.value, 10) || 0));
    const b = Math.min(255, Math.max(0, parseInt(bEl.value, 10) || 0));
    setRgb(r, g, b);
  }
  rEl.addEventListener("input", readRgbFields);
  gEl.addEventListener("input", readRgbFields);
  bEl.addEventListener("input", readRgbFields);
  hexEl.addEventListener("input", () => {
    const rgb = hexToRgb(hexEl.value.trim());
    if (rgb) setRgb(rgb.r, rgb.g, rgb.b);
  });

  // --- mode + gradient stops ---
  function setMode(next) {
    mode = next;
    modeSolidBtn.classList.toggle("active", next === "solid");
    modeGradientBtn.classList.toggle("active", next === "gradient");
    gradientEl.hidden = next !== "gradient";
    copyGradBtn.hidden = next !== "gradient";
    sync();
  }
  modeSolidBtn.addEventListener("click", () => setMode("solid"));
  modeGradientBtn.addEventListener("click", () => setMode("gradient"));

  function selectStop(which) {
    activeStop = which;
    stopABtn.classList.toggle("active", which === "a");
    stopBBtn.classList.toggle("active", which === "b");
    const rgb = hexToRgb(stops[which]);
    if (rgb) setRgb(rgb.r, rgb.g, rgb.b);
  }
  stopABtn.addEventListener("click", () => selectStop("a"));
  stopBBtn.addEventListener("click", () => selectStop("b"));
  angleEl.addEventListener("input", () => {
    gradPreviewEl.style.background = gradientValue();
  });

  // --- copy to clipboard ---
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments without the async clipboard API.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    copiedEl.hidden = false;
    clearTimeout(copy._t);
    copy._t = setTimeout(() => (copiedEl.hidden = true), 1200);
  }
  copyHexBtn.addEventListener("click", () => copy(currentHex()));
  copyRgbBtn.addEventListener("click", () => {
    const { r, g, b } = currentRgb();
    copy(`rgb(${r}, ${g}, ${b})`);
  });
  copyGradBtn.addEventListener("click", () => copy(gradientValue()));

  // --- open/close ---
  toggleBtn.addEventListener("click", () => {
    modal.hidden = false;
    sync();
  });
  closeBtn.addEventListener("click", () => (modal.hidden = true));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.hidden = true;
  });

  sync();
}
