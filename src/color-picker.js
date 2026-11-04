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
  const gradTypeEl = el("color-grad-type");
  const gradRepeatEl = el("color-grad-repeat");
  const stopsEl = el("color-stops");
  const addStopBtn = el("color-stop-add");
  const angleEl = el("color-angle");
  const gradPreviewEl = el("color-grad-preview");
  const copyHexBtn = el("color-copy-hex");
  const copyRgbBtn = el("color-copy-rgb");
  const copyGradBtn = el("color-copy-grad");
  const copiedEl = el("color-copied");

  let hsv = { h: 335, s: 0.7, v: 1 }; // current editing color
  let mode = "solid";
  // Gradient stops: each { hex, pos (0-100) }. At least two.
  let gradStops = [
    { hex: "#ff4d9d", pos: 0 },
    { hex: "#38f9d7", pos: 100 },
  ];
  let activeStop = 0;

  function currentRgb() {
    return hsvToRgb(hsv.h, hsv.s, hsv.v);
  }
  function currentHex() {
    const { r, g, b } = currentRgb();
    return rgbToHex(r, g, b);
  }

  function gradientValue() {
    const type = gradTypeEl.value; // linear | radial | conic
    const repeat = gradRepeatEl.checked ? "repeating-" : "";
    const angle = angleEl.value || 0;
    const stopsStr = gradStops
      .slice()
      .sort((a, b) => a.pos - b.pos)
      .map((s) => `${s.hex} ${s.pos}%`)
      .join(", ");
    let head = "";
    if (type === "linear") head = `${angle}deg, `;
    else if (type === "conic") head = `from ${angle}deg, `;
    else head = "circle, "; // radial
    return `${repeat}${type}-gradient(${head}${stopsStr})`;
  }

  // Build the stop chips (swatch + position + remove).
  function renderStops() {
    stopsEl.innerHTML = "";
    gradStops.forEach((stop, idx) => {
      const chip = document.createElement("div");
      chip.className = "color-stop-chip" + (idx === activeStop ? " active" : "");

      const sw = document.createElement("button");
      sw.className = "color-stop-swatch";
      sw.style.background = stop.hex;
      sw.title = "Edit this stop";
      sw.addEventListener("click", () => selectStop(idx));

      const pos = document.createElement("input");
      pos.className = "color-stop-pos";
      pos.type = "number";
      pos.min = "0";
      pos.max = "100";
      pos.value = String(stop.pos);
      pos.addEventListener("input", () => {
        stop.pos = Math.min(100, Math.max(0, parseInt(pos.value, 10) || 0));
        gradPreviewEl.style.background = gradientValue();
      });

      const del = document.createElement("button");
      del.className = "color-stop-del";
      del.textContent = "×";
      del.title = "Remove stop";
      del.disabled = gradStops.length <= 2;
      del.addEventListener("click", () => removeStop(idx));

      chip.append(sw, pos, del);
      stopsEl.appendChild(chip);
    });
    gradPreviewEl.style.background = gradientValue();
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
      gradStops[activeStop].hex = hex;
      const chip = stopsEl.children[activeStop];
      if (chip) chip.querySelector(".color-stop-swatch").style.background = hex;
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
    if (next === "gradient") {
      renderStops();
      selectStop(Math.min(activeStop, gradStops.length - 1));
    } else {
      sync();
    }
  }
  modeSolidBtn.addEventListener("click", () => setMode("solid"));
  modeGradientBtn.addEventListener("click", () => setMode("gradient"));

  function selectStop(idx) {
    activeStop = idx;
    [...stopsEl.children].forEach((c, i) => c.classList.toggle("active", i === idx));
    const rgb = hexToRgb(gradStops[idx].hex);
    if (rgb) setRgb(rgb.r, rgb.g, rgb.b);
  }

  function addStop() {
    // New stop at the midpoint, using the current color.
    const sorted = gradStops.slice().sort((a, b) => a.pos - b.pos);
    const pos = Math.round((sorted[sorted.length - 1].pos + sorted[0].pos) / 2);
    gradStops.push({ hex: currentHex(), pos });
    activeStop = gradStops.length - 1;
    renderStops();
    selectStop(activeStop);
  }

  function removeStop(idx) {
    if (gradStops.length <= 2) return;
    gradStops.splice(idx, 1);
    if (activeStop >= gradStops.length) activeStop = gradStops.length - 1;
    renderStops();
    selectStop(activeStop);
  }

  addStopBtn.addEventListener("click", addStop);
  angleEl.addEventListener("input", () => {
    gradPreviewEl.style.background = gradientValue();
  });
  gradTypeEl.addEventListener("change", () => {
    gradPreviewEl.style.background = gradientValue();
  });
  gradRepeatEl.addEventListener("change", () => {
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
