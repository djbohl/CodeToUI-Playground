import { readFile } from "node:fs/promises";
import path from "node:path";

export async function readScreenFiles(projectDir, screenName) {
  const dir = path.join(projectDir, "screens", screenName);
  const [html, css] = await Promise.all([
    readFile(path.join(dir, `${screenName}.html`), "utf8"),
    readFile(path.join(dir, `${screenName}.css`), "utf8").catch(() => ""),
  ]);
  return { html, css };
}

export async function readGlobalCss(projectDir) {
  try {
    return await readFile(path.join(projectDir, "global.css"), "utf8");
  } catch {
    return "";
  }
}

export function composeSrcdoc({ globalCss, screenCss, screenHtml, bridgeScript = "" }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${globalCss}</style>
<style>${screenCss}</style>
</head>
<body>
${screenHtml}
${bridgeScript ? `<script>${bridgeScript}</script>` : ""}
</body>
</html>`;
}
