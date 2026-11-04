import { parseFragment, serialize } from "parse5";
import crypto from "node:crypto";

function shortHash(input) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 6);
}

function getAttr(node, name) {
  const attr = node.attrs?.find((a) => a.name === name);
  return attr ? attr.value : undefined;
}

function setAttr(node, name, value) {
  node.attrs = node.attrs || [];
  const existing = node.attrs.find((a) => a.name === name);
  if (existing) existing.value = value;
  else node.attrs.push({ name, value });
}

function walkElements(node, parent, visit) {
  if (node.tagName) visit(node, parent);
  for (const child of node.childNodes || []) walkElements(child, node, visit);
}

/**
 * Assigns a stable data-proto-id to every element that doesn't already have
 * one, so Link mode's links survive incidental HTML edits. An id, once
 * assigned, is NEVER regenerated -- that's the actual safety net for link
 * survival. The hash for a *new* id is derived from tag + existing id/class +
 * position-among-same-tag-siblings, which is resilient to unrelated edits
 * elsewhere in the tree (unlike an absolute DOM path or a content hash, which
 * would break on the most common edits: inserting a sibling, or editing text).
 */
export function assignStableIds(html) {
  const fragment = parseFragment(html);
  const usedIds = new Set();

  walkElements(fragment, null, (node) => {
    const existing = getAttr(node, "data-proto-id");
    if (existing) usedIds.add(existing);
  });

  const siblingCounters = new Map(); // parentNode -> Map(tagName -> next index)
  function nextSiblingIndex(parent, tagName) {
    const key = parent || fragment;
    if (!siblingCounters.has(key)) siblingCounters.set(key, new Map());
    const counts = siblingCounters.get(key);
    const idx = counts.get(tagName) || 0;
    counts.set(tagName, idx + 1);
    return idx;
  }

  let changed = false;

  walkElements(fragment, null, (node, parent) => {
    const idx = nextSiblingIndex(parent, node.tagName);
    if (getAttr(node, "data-proto-id")) return;

    const idAttr = getAttr(node, "id") || "";
    const classAttr = getAttr(node, "class") || "";
    const base = `${node.tagName}|${idAttr}|${classAttr}|${idx}`;

    let id = `el-${shortHash(base)}`;
    let suffix = 0;
    while (usedIds.has(id)) {
      suffix += 1;
      id = `el-${shortHash(base)}-${suffix}`;
    }
    usedIds.add(id);
    setAttr(node, "data-proto-id", id);
    changed = true;
  });

  if (!changed) return html;
  return serialize(fragment);
}
