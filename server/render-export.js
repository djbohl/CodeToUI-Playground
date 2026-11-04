// Headless-Chromium exports (PNG screenshots, device-frame mockups, PDF).
// Puppeteer is an OPTIONAL dependency, imported lazily so the app runs fine
// without it; the endpoints report a friendly "not installed" error instead.

import { readScreenFiles, readGlobalCss } from "./render-pipeline.js";

let _browser = null;

async function getBrowser() {
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch {
    const err = new Error("Puppeteer isn't installed. Run: npm install puppeteer");
    err.code = "NO_PUPPETEER";
    throw err;
  }
  if (!_browser || !_browser.connected) {
    _browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  }
  return _browser;
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

async function screenHtml(projectDir, name) {
  const [{ html, css, js }, globalCss] = await Promise.all([
    readScreenFiles(projectDir, name),
    readGlobalCss(projectDir),
  ]);
  const jsTag = js ? `<script>${String(js).replace(/<\/script/gi, "<\\/script")}<\/script>` : "";
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${globalCss}</style><style>${css}</style></head><body>${html}${jsTag}</body></html>`;
}

// A frame wrapper around a screenshot data-URI. Returns the HTML to re-render
// and screenshot. `mockup` is one of: light-desktop, dark-desktop, phone.
function frameHtml(dataUri, mockup) {
  const dark = mockup === "dark-desktop";
  if (mockup === "phone") {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:transparent}
      .frame{display:inline-block;padding:18px;background:#111;border-radius:44px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
      .notch{height:22px;width:120px;background:#111;border-radius:0 0 16px 16px;margin:0 auto}
      .screen{overflow:hidden;border-radius:26px;background:#fff;width:fit-content}
      img{display:block}
    </style></head><body>
      <div class="frame"><div class="notch"></div><div class="screen"><img src="${dataUri}"></div></div>
    </body></html>`;
  }
  // desktop browser window (light or dark chrome)
  const bar = dark ? "#2a2e37" : "#e6e6ea";
  const bg = dark ? "#16132a" : "#f1f1f4";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent}
    .frame{display:inline-block;background:${bg};border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)}
    .bar{height:36px;background:${bar};display:flex;align-items:center;gap:8px;padding:0 14px}
    .dot{width:12px;height:12px;border-radius:50%}
    .r{background:#ff5f57}.y{background:#febc2e}.g{background:#28c840}
    img{display:block}
  </style></head><body>
    <div class="frame"><div class="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span></div><img src="${dataUri}"></div>
  </body></html>`;
}

/** Returns [{ name, b64 }] PNG screenshots, optionally wrapped in a mockup. */
export async function screenshotScreens({ projectDir, screens, deviceWidth = 1280, mockup = "none" }) {
  const browser = await getBrowser();
  const out = [];
  for (const name of screens) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: deviceWidth, height: 800, deviceScaleFactor: 2 });
      await page.setContent(await screenHtml(projectDir, name), { waitUntil: "load" });
      // Puppeteer v23+ returns a Uint8Array; wrap in Buffer for real base64.
      let buf = Buffer.from(await page.screenshot({ fullPage: true, type: "png" }));
      if (mockup && mockup !== "none") {
        const dataUri = "data:image/png;base64," + buf.toString("base64");
        await page.setContent(frameHtml(dataUri, mockup), { waitUntil: "load" });
        const el = await page.$(".frame");
        buf = Buffer.from(await el.screenshot({ type: "png", omitBackground: true }));
      }
      out.push({ name, b64: buf.toString("base64") });
    } finally {
      await page.close();
    }
  }
  return out;
}

/** Multi-page PDF: one screen per page (built from the screenshots). */
export async function pdfScreens({ projectDir, screens, deviceWidth = 1280 }) {
  const shots = await screenshotScreens({ projectDir, screens, deviceWidth });
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    const imgs = shots
      .map((s) => `<img src="data:image/png;base64,${s.b64}">`)
      .join("");
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
      @page{margin:0}
      html,body{margin:0}
      img{display:block;width:100%;page-break-after:always}
      img:last-child{page-break-after:auto}
    </style></head><body>${imgs}</body></html>`;
    await page.setContent(doc, { waitUntil: "load" });
    const pdf = await page.pdf({ printBackground: true, format: "A4" });
    return pdf;
  } finally {
    await page.close();
  }
}
