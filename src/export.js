// Client-side exporters that need no external tools:
//   - buildStandaloneHtml: one self-contained .html that plays the prototype
//   - buildZip: a store-only .zip of the project's source files
//   - openPrintWindow: stack screens for the browser's Save-as-PDF
// Heavier exports (PNG images, mockup frames, GIF, MP4) need a headless render
// pipeline and live elsewhere.

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// --- Standalone playable prototype ------------------------------------------
// Screens render in same-origin (non-sandboxed) iframes, so the player wires
// click handlers directly onto each screen's DOM -- no postMessage bridge or
// string-escaping gymnastics needed.
const STANDALONE_PLAYER = `
(function(){
  var SCREENS=DATA.screens, GLOBAL=DATA.global, LINKS=DATA.links, START=DATA.start;
  var frame=document.getElementById('frame');
  var base=null, history=[], overlays=[];
  function mapFor(name){
    var m={};
    LINKS.forEach(function(l){ if(l.screen===name){ m[l.elementId]={target:l.target,mode:l.mode||'navigate'}; } });
    return m;
  }
  function srcdoc(name){
    var s=SCREENS[name]||{html:'',css:''};
    return '<!doctype html><html><head><meta charset="utf-8"><style>'+GLOBAL+'</style><style>'+s.css+'</style></head><body>'+s.html+'</body></html>';
  }
  function wire(doc, name){
    var map=mapFor(name);
    Object.keys(map).forEach(function(id){
      var el=doc.querySelector('[data-proto-id="'+id+'"]'); if(el) el.style.cursor='pointer';
    });
    doc.addEventListener('click', function(ev){
      var el=ev.target.closest?ev.target.closest('[data-proto-id]'):null;
      while(el){
        var id=el.getAttribute('data-proto-id');
        if(map[id]){ ev.preventDefault(); nav(map[id].target, map[id].mode); return; }
        el=el.parentElement&&el.parentElement.closest?el.parentElement.closest('[data-proto-id]'):null;
      }
    }, true);
  }
  function renderBase(name){
    base=name;
    frame.onload=function(){ try{ wire(frame.contentDocument, name); }catch(e){} };
    frame.srcdoc=srcdoc(name);
  }
  function openOverlay(name){
    var ov=document.createElement('div'); ov.className='proto-ov';
    var f=document.createElement('iframe'); ov.appendChild(f);
    ov.addEventListener('click', function(e){ if(e.target===ov) closeTop(); });
    f.onload=function(){ try{ wire(f.contentDocument, name); }catch(e){} };
    document.body.appendChild(ov); overlays.push(ov); f.srcdoc=srcdoc(name);
  }
  function closeTop(){ var o=overlays.pop(); if(o) o.remove(); }
  function closeAll(){ overlays.forEach(function(o){ o.remove(); }); overlays=[]; }
  function nav(target, mode){
    if(target==='$back'){ if(overlays.length) closeTop(); else if(history.length) renderBase(history.pop()); return; }
    if(target==='$home'){ closeAll(); if(base&&base!==START) history.push(base); renderBase(START); return; }
    if(mode==='overlay'){ openOverlay(target); return; }
    closeAll(); if(base) history.push(base); renderBase(target);
  }
  renderBase(START);
})();
`;

export function buildStandaloneHtml({ screens, globalCss, links, startScreen, title = "Prototype" }) {
  const screenMap = {};
  for (const s of screens) screenMap[s.name] = { html: s.html, css: s.css };
  const data = { screens: screenMap, global: globalCss || "", links: links || [], start: startScreen };
  // Prevent any "</script>" inside embedded HTML/CSS from closing our script tag.
  const dataJson = JSON.stringify(data).replace(/<\//g, "<\\/");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  html,body{margin:0;height:100%;background:#0b0d11}
  #frame{border:0;width:100%;height:100%;display:block;background:#fff}
  .proto-ov{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);z-index:10}
  .proto-ov iframe{border:2px solid #333;width:90%;height:90%;max-width:1200px;background:#fff}
</style></head><body>
<iframe id="frame" title="${escapeHtml(title)}"></iframe>
<script>
var DATA = ${dataJson};
${STANDALONE_PLAYER}
</script>
</body></html>`;
}

// --- Store-only ZIP (no compression, no dependencies) -----------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: [{ path, content(string) }] -> Uint8Array of a valid .zip */
export function buildZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
  const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

  for (const f of files) {
    const nameBytes = enc.encode(f.path);
    const data = enc.encode(f.content);
    const crc = crc32(data);

    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length),
      ...u16(nameBytes.length), ...u16(0),
    ];
    chunks.push(new Uint8Array(local), nameBytes, data);

    central.push([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length),
      ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset),
    ]);
    central.push(nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }

  const centralStart = offset;
  const centralChunks = [];
  let centralSize = 0;
  for (const c of central) {
    const arr = c instanceof Uint8Array ? c : new Uint8Array(c);
    centralChunks.push(arr);
    centralSize += arr.length;
  }

  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(centralStart), ...u16(0),
  ]);

  const all = [...chunks, ...centralChunks, end];
  const total = all.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

// --- PDF via the browser's print dialog -------------------------------------
// Each screen is rendered at the chosen device width in a same-origin iframe,
// measured once loaded (so nothing is clipped), and scaled to fit the printable
// page width. Printing waits until every screen has loaded and sized.
const PRINT_PAGE_WIDTH = 720; // approx printable width in px (Letter/A4 w/ margins)

export function openPrintWindow({ screens, globalCss, deviceWidth, title = "Prototype" }) {
  const w = window.open("", "_blank");
  if (!w) return false;

  const width = deviceWidth || 1280; // Full falls back to a desktop width
  const scale = Math.min(1, PRINT_PAGE_WIDTH / width);

  const doc = w.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#fff}
  .page{margin:0 auto 16px;break-after:page;overflow:hidden;width:${width * scale}px}
  .page:last-child{break-after:auto;margin-bottom:0}
  .page iframe{border:0;display:block;width:${width}px;transform:scale(${scale});transform-origin:top left}
  @page{margin:12mm}
  @media print{.page{margin:0}}
</style></head><body></body></html>`);
  doc.close();

  let pending = screens.length;
  const finish = () => {
    if (--pending === 0) setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  for (const s of screens) {
    const page = doc.createElement("div");
    page.className = "page";
    const f = doc.createElement("iframe");
    f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${globalCss || ""}</style><style>${s.css || ""}</style></head><body>${s.html}</body></html>`;
    f.onload = () => {
      let h = 0;
      try {
        h = f.contentDocument.documentElement.scrollHeight;
      } catch {
        h = 0;
      }
      if (!h) h = 1000;
      f.style.height = `${h}px`;
      page.style.height = `${h * scale}px`;
      finish();
    };
    page.appendChild(f);
    doc.body.appendChild(page);
  }
  return true;
}
