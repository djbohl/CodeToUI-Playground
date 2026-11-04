import { WebSocketServer } from "ws";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ProjectWatcher } from "./watcher.js";
import { readScreenFiles, readGlobalCss } from "./render-pipeline.js";
import { reconcileScreens, createScreen, deleteScreen } from "./screens.js";
import { assignStableIds } from "./stable-ids.js";
import { readLinks, writeLinks } from "./links.js";
import { screenshotScreens, pdfScreens, closeBrowser } from "./render-export.js";
import {
  listProjects,
  scaffoldProject,
  deleteProject,
  readActive,
  writeActive,
} from "./projects.js";

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function pathToScreenFile(projectDir, absPath) {
  if (absPath === path.join(projectDir, "global.css")) {
    return { screen: null, file: "globalCss" };
  }
  // <project>/screens/<Screen>/<Screen>.(html|css)
  const rel = path.relative(path.join(projectDir, "screens"), absPath);
  const parts = rel.split(path.sep);
  if (parts.length !== 2) return null;
  const [screen, filename] = parts;
  const ext = path.extname(filename).slice(1); // 'html' | 'css' | 'js'
  if (ext !== "html" && ext !== "css" && ext !== "js") return null;
  return { screen, file: ext };
}

/**
 * The whole live-sync backend, independent of how it's hosted: it watches the
 * active project folder, pushes genuine external edits over a WebSocket, and
 * serves the read/write REST API. It operates on one *active* project at a
 * time within a projects root, and can switch between projects (re-pointing the
 * file watcher) without restarting. The Vite dev plugin and the packaged
 * Electron app both mount this, so dev and desktop can't drift apart.
 */
export function createProtoApi({ projectsRoot, wsPort, initialProject }) {
  let activeName = initialProject;
  let activeDir = path.join(projectsRoot, activeName);

  const wss = new WebSocketServer({ port: wsPort });

  function broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(data);
    }
  }

  let watcher = null;
  function startWatcher() {
    if (watcher) watcher.close();
    watcher = new ProjectWatcher(activeDir, {
      onExternalChange({ absPath, content }) {
        const info = pathToScreenFile(activeDir, absPath);
        if (!info) return;
        broadcast({ type: "externalChange", screen: info.screen, file: info.file, content });
      },
    });
  }
  startWatcher();

  async function setActive(name) {
    activeName = name;
    activeDir = path.join(projectsRoot, name);
    startWatcher();
    await writeActive(projectsRoot, name);
  }

  async function middleware(req, res, next) {
    if (!req.url?.startsWith("/api/")) return next();

    const json = (obj) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(obj));
    };

    try {
      // --- Projects ---------------------------------------------------------
      if (req.url === "/api/projects" && req.method === "GET") {
        json({ projects: await listProjects(projectsRoot), active: activeName });
        return;
      }

      if (req.url === "/api/projects" && req.method === "POST") {
        const body = await readJsonBody(req);
        await scaffoldProject(projectsRoot, body.name);
        json({ projects: await listProjects(projectsRoot), active: activeName });
        return;
      }

      if (req.url === "/api/projects/active" && req.method === "POST") {
        const body = await readJsonBody(req);
        const projects = await listProjects(projectsRoot);
        if (!projects.includes(body.name)) {
          res.statusCode = 404;
          res.end("no such project");
          return;
        }
        await setActive(body.name);
        json({ active: activeName });
        return;
      }

      const projMatch = req.url.match(/^\/api\/projects\/([^/]+)$/);
      if (projMatch && req.method === "DELETE") {
        const name = decodeURIComponent(projMatch[1]);
        await deleteProject(projectsRoot, name);
        if (name === activeName) {
          await setActive(await readActive(projectsRoot));
        }
        json({ projects: await listProjects(projectsRoot), active: activeName });
        return;
      }

      // --- Active project content ------------------------------------------
      if (req.url === "/api/project" && req.method === "GET") {
        const { config, screens } = await reconcileScreens(activeDir);
        const globalCss = await readGlobalCss(activeDir);
        json({ config, screens, globalCss, wsPort, activeProject: activeName });
        return;
      }

      // --- Screens (pages) --------------------------------------------------
      if (req.url === "/api/screens" && req.method === "POST") {
        const body = await readJsonBody(req);
        await createScreen(activeDir, body.name);
        const { config, screens } = await reconcileScreens(activeDir);
        json({ config, screens });
        return;
      }

      const screensMatch = req.url.match(/^\/api\/screens\/([^/]+)$/);
      if (screensMatch && req.method === "DELETE") {
        const name = decodeURIComponent(screensMatch[1]);
        await deleteScreen(activeDir, name);
        // Drop any links on or pointing to the deleted screen.
        const links = await readLinks(activeDir);
        links.links = links.links.filter((l) => l.screen !== name && l.target !== name);
        await writeLinks(activeDir, links);
        const { config, screens } = await reconcileScreens(activeDir);
        json({ config, screens });
        return;
      }

      if (req.url === "/api/links" && req.method === "GET") {
        json(await readLinks(activeDir));
        return;
      }

      if (req.url === "/api/links" && req.method === "POST") {
        const body = await readJsonBody(req);
        json(await writeLinks(activeDir, body));
        return;
      }

      // --- Headless exports (optional Puppeteer) ---------------------------
      if (req.url === "/api/export/images" && req.method === "POST") {
        const body = await readJsonBody(req);
        try {
          const files = await screenshotScreens({
            projectDir: activeDir,
            screens: body.screens || [],
            deviceWidth: body.deviceWidth || 1280,
            mockup: body.mockup || "none",
          });
          json({ files });
        } catch (e) {
          if (e.code === "NO_PUPPETEER") { res.statusCode = 501; res.end(e.message); return; }
          throw e;
        }
        return;
      }

      if (req.url === "/api/export/pdf" && req.method === "POST") {
        const body = await readJsonBody(req);
        try {
          const pdf = await pdfScreens({
            projectDir: activeDir,
            screens: body.screens || [],
            deviceWidth: body.deviceWidth || 1280,
          });
          res.setHeader("Content-Type", "application/pdf");
          res.end(Buffer.from(pdf));
        } catch (e) {
          if (e.code === "NO_PUPPETEER") { res.statusCode = 501; res.end(e.message); return; }
          throw e;
        }
        return;
      }

      if (req.url === "/api/global-css" && req.method === "GET") {
        json({ content: await readGlobalCss(activeDir) });
        return;
      }

      if (req.url === "/api/global-css" && req.method === "POST") {
        const body = await readJsonBody(req);
        const filePath = path.join(activeDir, "global.css");
        watcher.recordSelfWrite(filePath, body.content);
        await writeFile(filePath, body.content, "utf8");
        json({ ok: true });
        return;
      }

      const screenMatch = req.url.match(/^\/api\/screen\/([^/]+)$/);
      if (screenMatch && req.method === "GET") {
        const screen = decodeURIComponent(screenMatch[1]);
        json(await readScreenFiles(activeDir, screen));
        return;
      }

      if (screenMatch && req.method === "POST") {
        const screen = decodeURIComponent(screenMatch[1]);
        const body = await readJsonBody(req);
        const { file, content } = body; // file: 'html' | 'css' | 'js'
        if (file !== "html" && file !== "css" && file !== "js") {
          res.statusCode = 400;
          res.end("invalid file type");
          return;
        }
        const finalContent = file === "html" ? assignStableIds(content) : content;
        const filePath = path.join(activeDir, "screens", screen, `${screen}.${file}`);
        watcher.recordSelfWrite(filePath, finalContent);
        await writeFile(filePath, finalContent, "utf8");
        json({ ok: true, content: finalContent });
        return;
      }

      next();
    } catch (err) {
      res.statusCode = 500;
      res.end(String(err?.message || err));
    }
  }

  function close() {
    watcher?.close();
    wss.close();
    closeBrowser();
  }

  return { middleware, close };
}
