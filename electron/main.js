import { app, BrowserWindow, shell } from "electron";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import connect from "connect";
import serveStatic from "serve-static";
import { createProtoApi } from "../server/create-api.js";
import { ensureProjectsRoot } from "../server/projects.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HTTP_PORT = 5810;
const WS_PORT = 5801;

let api = null;
let httpServer = null;

/**
 * The projects root must be writable and easy for the user to find (so they
 * can also edit it with Claude Code / Codex CLI). We keep it in the user's
 * Documents; each project is a subfolder. It's seeded once from the starter
 * projects bundled with the app.
 */
function resolveProjectsRoot() {
  return path.join(app.getPath("documents"), "CodeToUI Playground");
}

function bundledProjectsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "projects")
    : path.join(__dirname, "..", "projects");
}

function resolveClientDir() {
  // The built client (`vite build` output) is shipped as an unpacked resource.
  return app.isPackaged
    ? path.join(process.resourcesPath, "dist")
    : path.join(__dirname, "..", "dist");
}

async function startServer() {
  const projectsRoot = resolveProjectsRoot();
  const clientDir = resolveClientDir();

  const initialProject = await ensureProjectsRoot(projectsRoot, {
    seedFrom: bundledProjectsDir(),
  });
  api = createProtoApi({ projectsRoot, wsPort: WS_PORT, initialProject });

  const connectApp = connect();
  connectApp.use(api.middleware); // handles /api/*, falls through otherwise
  connectApp.use(serveStatic(clientDir, { index: ["index.html"] }));

  return new Promise((resolve, reject) => {
    httpServer = createServer(connectApp);
    httpServer.once("error", reject);
    httpServer.listen(HTTP_PORT, "127.0.0.1", () => resolve());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: "#0b0d11",
    title: "CodeToUI Playground",
  });

  // "Pop out" uses window.open; let Electron give it a normal child window.
  win.webContents.setWindowOpenHandler(() => ({ action: "allow" }));

  win.loadURL(`http://127.0.0.1:${HTTP_PORT}`);
  return win;
}

app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (err) {
    console.error("Failed to start local server:", err);
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  api?.close();
  httpServer?.close();
});
