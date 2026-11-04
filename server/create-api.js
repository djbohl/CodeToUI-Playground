import { WebSocketServer } from "ws";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ProjectWatcher } from "./watcher.js";
import { readScreenFiles, readGlobalCss } from "./render-pipeline.js";
import { reconcileScreens } from "./screens.js";
import { assignStableIds } from "./stable-ids.js";

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/**
 * The whole live-sync backend, independent of how it's hosted: it watches the
 * project folder, pushes genuine external edits over a WebSocket, and serves
 * the read/write REST API. The Vite dev plugin mounts this onto Vite's connect
 * server; the packaged Electron app mounts the same thing onto its own http
 * server. Keeping it in one place means dev and the desktop build can never
 * drift apart.
 */
export function createProtoApi({ projectDir, wsPort }) {
  const globalCssPath = path.join(projectDir, "global.css");
  const screensDir = path.join(projectDir, "screens");

  function pathToScreenFile(absPath) {
    if (absPath === globalCssPath) {
      return { screen: null, file: "globalCss" };
    }
    // project/screens/<Screen>/<Screen>.(html|css)
    const rel = path.relative(screensDir, absPath);
    const parts = rel.split(path.sep);
    if (parts.length !== 2) return null;
    const [screen, filename] = parts;
    const ext = path.extname(filename).slice(1); // 'html' | 'css'
    if (ext !== "html" && ext !== "css") return null;
    return { screen, file: ext };
  }

  // Standalone port, deliberately NOT sharing the host's httpServer: on Vite,
  // sharing the 'upgrade' event with its internal HMR WebSocket caused flaky
  // connect/disconnect loops. A dedicated port sidesteps that everywhere.
  const wss = new WebSocketServer({ port: wsPort });

  function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(data);
    }
  }

  const watcher = new ProjectWatcher(projectDir, {
    onExternalChange({ absPath, content }) {
      const info = pathToScreenFile(absPath);
      if (!info) return;
      broadcast({ type: "externalChange", screen: info.screen, file: info.file, content });
    },
  });

  async function middleware(req, res, next) {
    if (!req.url?.startsWith("/api/")) return next();

    try {
      if (req.url === "/api/project" && req.method === "GET") {
        const { config, screens } = await reconcileScreens(projectDir);
        const globalCss = await readGlobalCss(projectDir);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ config, screens, globalCss, wsPort }));
        return;
      }

      if (req.url === "/api/global-css" && req.method === "GET") {
        const content = await readGlobalCss(projectDir);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ content }));
        return;
      }

      if (req.url === "/api/global-css" && req.method === "POST") {
        const body = await readJsonBody(req);
        watcher.recordSelfWrite(globalCssPath, body.content);
        await writeFile(globalCssPath, body.content, "utf8");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      const screenMatch = req.url.match(/^\/api\/screen\/([^/]+)$/);
      if (screenMatch && req.method === "GET") {
        const screen = decodeURIComponent(screenMatch[1]);
        const files = await readScreenFiles(projectDir, screen);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(files));
        return;
      }

      if (screenMatch && req.method === "POST") {
        const screen = decodeURIComponent(screenMatch[1]);
        const body = await readJsonBody(req);
        const { file, content } = body; // file: 'html' | 'css'
        if (file !== "html" && file !== "css") {
          res.statusCode = 400;
          res.end("invalid file type");
          return;
        }
        const finalContent = file === "html" ? assignStableIds(content) : content;
        const filePath = path.join(screensDir, screen, `${screen}.${file}`);
        watcher.recordSelfWrite(filePath, finalContent);
        await writeFile(filePath, finalContent, "utf8");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, content: finalContent }));
        return;
      }

      next();
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err?.message || err));
    }
  }

  function close() {
    watcher.close();
    wss.close();
  }

  return { middleware, close };
}
