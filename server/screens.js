import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Reconciles proto.config.json's screen list against what's actually on disk.
 * A folder under screens/ with no config entry is a screen an external tool
 * (or the user, outside the app) created directly -> auto-add it, order last.
 * A config entry with no matching folder is flagged, not silently dropped,
 * since the folder may reappear (e.g. after a git checkout).
 */
export async function reconcileScreens(projectDir) {
  const configPath = path.join(projectDir, "proto.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));

  const entries = await readdir(path.join(projectDir, "screens"), { withFileTypes: true });
  const onDisk = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  const known = new Set(config.screens);
  const newlyFound = onDisk.filter((name) => !known.has(name));
  const missing = config.screens.filter((name) => !onDisk.includes(name));

  if (newlyFound.length > 0) {
    config.screens = [...config.screens, ...newlyFound];
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  }

  return {
    config,
    screens: config.screens.map((name) => ({ name, missing: missing.includes(name) })),
  };
}
