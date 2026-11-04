import { readdir, readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const SCREEN_NAME_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function isValidScreenName(name) {
  return typeof name === "string" && SCREEN_NAME_RE.test(name);
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Create a new screen folder + starter files and register it in the config. */
export async function createScreen(projectDir, name) {
  if (!isValidScreenName(name)) {
    throw new Error("Invalid screen name. Use letters, numbers, - or _ (no spaces).");
  }
  const dir = path.join(projectDir, "screens", name);
  if (await pathExists(dir)) throw new Error(`Screen "${name}" already exists.`);

  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${name}.html`),
    `<main>\n  <h1>${name}</h1>\n</main>\n`,
    "utf8"
  );
  await writeFile(path.join(dir, `${name}.css`), `h1 {\n  color: var(--accent);\n}\n`, "utf8");

  const configPath = path.join(projectDir, "proto.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (!config.screens.includes(name)) {
    config.screens.push(name);
    await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  }
  return name;
}

/**
 * Delete a screen: remove its folder and config entry. Refuses to delete the
 * last screen. If it was the start screen, the start moves to the first
 * remaining one. Links are cleaned up separately by the caller.
 */
export async function deleteScreen(projectDir, name) {
  const configPath = path.join(projectDir, "proto.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (!config.screens.includes(name)) throw new Error(`Screen "${name}" not found.`);
  if (config.screens.length <= 1) throw new Error("Can't delete the only screen.");

  config.screens = config.screens.filter((s) => s !== name);
  if (config.startScreen === name) config.startScreen = config.screens[0];
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

  await rm(path.join(projectDir, "screens", name), { recursive: true, force: true });
}

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
