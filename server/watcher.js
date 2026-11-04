import chokidar from "chokidar";
import { readFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

function hashContent(content) {
  return crypto.createHash("sha1").update(content).digest("hex");
}

/**
 * Watches the project's screen files on disk and distinguishes the app's own
 * writes (echoes) from genuine external edits (Claude Code, a text editor, etc).
 * Call `recordSelfWrite` right before/after the app writes a file so the next
 * chokidar "change" event for that path can be recognized as an echo and ignored.
 */
export class ProjectWatcher {
  constructor(projectDir, { onExternalChange } = {}) {
    this.projectDir = projectDir;
    this.onExternalChange = onExternalChange || (() => {});
    this.lastWrittenHash = new Map(); // absolute path -> hash this app last wrote
    this.watcher = chokidar.watch(
      [path.join(projectDir, "screens"), path.join(projectDir, "global.css")],
      {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 30 },
      }
    );
    this.watcher.on("change", (filePath) => this._handleChange(filePath));
    this.watcher.on("add", (filePath) => this._handleChange(filePath));
  }

  recordSelfWrite(filePath, content) {
    this.lastWrittenHash.set(path.resolve(filePath), hashContent(content));
  }

  async _handleChange(filePath) {
    const absPath = path.resolve(filePath);
    let content;
    try {
      content = await readFile(absPath, "utf8");
    } catch {
      return; // file briefly unreadable mid-write; chokidar awaitWriteFinish should prevent this, but be defensive
    }
    const newHash = hashContent(content);
    const selfHash = this.lastWrittenHash.get(absPath);

    if (selfHash === newHash) {
      // This change event is an echo of our own write. Ignore it.
      return;
    }

    // Genuine external change (or the first time we've seen this path change).
    this.lastWrittenHash.set(absPath, newHash);
    this.onExternalChange({ absPath, content });
  }

  close() {
    return this.watcher.close();
  }
}
