import { readdir, readFile, writeFile, mkdir, rm, cp, stat } from "node:fs/promises";
import path from "node:path";

const ACTIVE_FILE = ".active";
const NAME_RE = /^[A-Za-z0-9 _-]{1,64}$/;

export function isValidProjectName(name) {
  return typeof name === "string" && NAME_RE.test(name) && name.trim() === name;
}

/** Project folders are the direct subdirectories of the projects root. */
export async function listProjects(projectsRoot) {
  try {
    const entries = await readdir(projectsRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Create a new project folder with a minimal starter screen. */
export async function scaffoldProject(projectsRoot, name) {
  if (!isValidProjectName(name)) {
    throw new Error("Invalid project name. Use letters, numbers, spaces, - or _.");
  }
  const dir = path.join(projectsRoot, name);
  if (await exists(dir)) throw new Error(`Project "${name}" already exists.`);

  await mkdir(path.join(dir, "screens", "Home"), { recursive: true });

  const config = {
    screens: ["Home"],
    startScreen: "Home",
    deviceSizes: { phone: 390, tablet: 768, desktop: 1280 },
  };
  await writeFile(path.join(dir, "proto.config.json"), JSON.stringify(config, null, 2) + "\n", "utf8");
  await writeFile(
    path.join(dir, "global.css"),
    ":root {\n  --accent: #5b8cff;\n}\n\nbody {\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n  margin: 0;\n  padding: 32px;\n}\n",
    "utf8"
  );
  await writeFile(path.join(dir, "links.json"), JSON.stringify({ version: 1, links: [] }, null, 2) + "\n", "utf8");
  await writeFile(
    path.join(dir, "screens", "Home", "Home.html"),
    '<main>\n  <h1>Home</h1>\n  <p>Start designing this screen.</p>\n</main>\n',
    "utf8"
  );
  await writeFile(
    path.join(dir, "screens", "Home", "Home.css"),
    "h1 {\n  color: var(--accent);\n}\n",
    "utf8"
  );

  return name;
}

export async function deleteProject(projectsRoot, name) {
  if (!isValidProjectName(name)) throw new Error("Invalid project name.");
  const projects = await listProjects(projectsRoot);
  if (!projects.includes(name)) throw new Error(`Project "${name}" not found.`);
  if (projects.length <= 1) throw new Error("Can't delete the only project.");
  await rm(path.join(projectsRoot, name), { recursive: true, force: true });
}

export async function readActive(projectsRoot) {
  try {
    const name = (await readFile(path.join(projectsRoot, ACTIVE_FILE), "utf8")).trim();
    const projects = await listProjects(projectsRoot);
    if (projects.includes(name)) return name;
  } catch {
    /* fall through */
  }
  const projects = await listProjects(projectsRoot);
  return projects[0] || null;
}

export async function writeActive(projectsRoot, name) {
  await writeFile(path.join(projectsRoot, ACTIVE_FILE), name + "\n", "utf8");
}

/**
 * Make sure the projects root exists and holds at least one project. If it's
 * empty, seed it: copy a bundled starter folder when provided, otherwise
 * scaffold a fresh "Demo" project. Returns the resolved active project name.
 */
export async function ensureProjectsRoot(projectsRoot, { seedFrom } = {}) {
  await mkdir(projectsRoot, { recursive: true });
  let projects = await listProjects(projectsRoot);

  if (projects.length === 0) {
    if (seedFrom && (await exists(seedFrom))) {
      // seedFrom is itself a projects-root-shaped folder (one subdir per project).
      await cp(seedFrom, projectsRoot, { recursive: true });
      projects = await listProjects(projectsRoot);
    }
    if (projects.length === 0) {
      await scaffoldProject(projectsRoot, "Demo");
    }
  }

  return readActive(projectsRoot);
}
