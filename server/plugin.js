import { WebSocketServer } from "ws";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ProjectWatcher } from "./watcher.js";
import { readScreenFiles, readGlobalCss } from "./render-pipeline.js";
import { reconcileScreens } from "./screens.js";
import { assignStableIds } from "./stable-ids.js";

const PROJECT_DIR = path.resolve(process.cwd(), "project");
const PROTO_WS_PORT = 5801;

function pathToScreenFile(absPath) {
  if (absPath === path.join(PROJECT_DIR, "global.css")) {
    return { screen: null, file: "globalCss" };
  }
  // project/screens/<Screen>/<Screen>.(html|css)
  const rel = path.relative(path.join(PROJECT_DIR, "screens"), absPath);
  const parts = rel.split(path.sep);
  if (parts.length !== 2) return null;
  const [screen, filename] = parts;
  const ext = path.extname(filename).slice(1); // 'html' | 'css'
  if (ext !== "html" && ext !== "css") return null;
  return { screen, file: ext };
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function protoDevPlugin() {
  let wss;

  return {
    name: "proto-dev-server",
    configureServer(server) {
      // Deliberately NOT attached to Vite's own httpServer: sharing it would
      // put our upgrade handling on the same 'upgrade' event as Vite's own
      // internal HMR WebSocket, which caused handshake conflicts (flaky
      // connect/disconnect loops) in practice. A standalone port sidesteps
      // that entirely.
      wss = new WebSocketServer({ port: PROTO_WS_PORT });

      const watcher = new ProjectWatcher(PROJECT_DIR, {
        onExternalChange({ absPath, content }) {
          const info = pathToScreenFile(absPath);
          if (!info) return;
          broadcast({ type: "externalChange", screen: info.screen, file: info.file, content });
        },
      });

      function broadcast(message) {
        const data = JSON.stringify(message);
        for (const client of wss.clients) {
          if (client.readyState === client.OPEN) client.send(data);
        }
      }

      server.httpServer?.once("close", () => {
        watcher.close();
        wss.close();
      });

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        try {
          if (req.url === "/api/project" && req.method === "GET") {
            const { config, screens } = await reconcileScreens(PROJECT_DIR);
            const globalCss = await readGlobalCss(PROJECT_DIR);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ config, screens, globalCss, wsPort: PROTO_WS_PORT }));
            return;
          }

          if (req.url === "/api/global-css" && req.method === "GET") {
            const content = await readGlobalCss(PROJECT_DIR);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ content }));
            return;
          }

          if (req.url === "/api/global-css" && req.method === "POST") {
            const body = await readJsonBody(req);
            const filePath = path.join(PROJECT_DIR, "global.css");
            watcher.recordSelfWrite(filePath, body.content);
            await writeFile(filePath, body.content, "utf8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
            return;
          }

          const screenMatch = req.url.match(/^\/api\/screen\/([^/]+)$/);
          if (screenMatch && req.method === "GET") {
            const screen = decodeURIComponent(screenMatch[1]);
            const files = await readScreenFiles(PROJECT_DIR, screen);
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
            const filePath = path.join(PROJECT_DIR, "screens", screen, `${screen}.${file}`);
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
      });
    },
  };
}
