import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT = { version: 1, links: [] };

/**
 * links.json is the canonical store of prototype navigation. Each link:
 *   { id, screen, elementId, target, transition }
 *     id         unique key, "<screen>:<elementId>"
 *     screen     source screen the element lives on
 *     elementId  the element's stable data-proto-id
 *     target     destination screen name
 *     transition "none" | "fade" | "slide"
 */
export async function readLinks(projectDir) {
  try {
    const raw = await readFile(path.join(projectDir, "links.json"), "utf8");
    const data = JSON.parse(raw);
    return {
      version: data.version || 1,
      links: Array.isArray(data.links) ? data.links : [],
    };
  } catch {
    return { ...DEFAULT };
  }
}

export async function writeLinks(projectDir, data) {
  const out = {
    version: 1,
    links: Array.isArray(data?.links) ? data.links : [],
  };
  await writeFile(
    path.join(projectDir, "links.json"),
    JSON.stringify(out, null, 2) + "\n",
    "utf8"
  );
  return out;
}
