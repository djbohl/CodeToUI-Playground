# CodeToUI Playground — Plan & Status

Write code to quickly build UI mockups and click-through prototypes, with a
live preview over a plain folder of files on disk.

## What it is

Type HTML/CSS on the left, see the result instantly on the right. Build several
screens, and instead of coding interactions, click an element in the preview
and pick which screen it navigates to.

## Architecture (resolved)

The project is **just files on disk** — the app is a live-reloading preview +
editor + prototyping surface on top of that folder, and it doesn't care who
edits the files. You can type in the built-in editor, or point an AI coding
tool (Claude Code, Claude Desktop, OpenAI's Codex CLI) at the same folder and
dictate changes. Core guarantee: **the preview always reflects disk truth, no
matter the edit's origin.**

Ships two ways: run from source (`npm run dev`, Vite) or as an unsigned Electron
desktop app for macOS and Windows. Both mount the same backend (`createProtoApi`).

## Build order & status

- [x] **1 — Single screen**: Vite dev server + chokidar watcher + WebSocket
  push, CodeMirror HTML/CSS tabs, sandboxed iframe preview, echo-detection +
  non-destructive conflict banner sync.
- [x] **2 — Multi-screen + global CSS + device sizes**: sidebar reconciled
  against `screens/` on disk, Global CSS tab, device-width switcher, and the
  `data-proto-id` stable-id injection pipeline (on save).
- [x] **3 — Overview board**: all screens as scaled read-only thumbnails.
- [x] **Preview UX** (added): fit-to-pane device framing, zoom (−/+, ctrl/pinch)
  and pan (hand tool / two-finger scroll) via a postMessage bridge, editor
  show/hide, and a pop-out preview window.
- [x] **Packaging** (added): Electron desktop app (unsigned) for macOS/Windows,
  README, and CC BY-NC 4.0 license.
- [~] **4 — Link mode + Play mode** (in progress, needs testing):
  - [x] `links.json` API (read/write) and the `{id, screen, elementId, target,
    transition}` schema.
  - [x] Link mode: click an element → assign a target screen + transition;
    linked elements are outlined; stable ids are ensured on entry.
  - [x] Play mode: full-screen runner with click-through navigation, Back, Esc
    to exit, and fade/slide transitions.
  - [ ] Verify end-to-end in the browser (see Verification below).
  - [ ] Support `data-goto="ScreenName"` in raw HTML as a code-first equivalent.
  - [ ] "Flash clickable areas" toggle in Play mode.
- [ ] **5 — Export & polish**:
  - [ ] Standalone HTML that plays the prototype offline (`file://`, zero
    build, zero network) — reuse the Play-mode script as a vanilla template.
  - [ ] PNG per screen via a headless browser (on-demand, not a runtime dep).
  - [ ] Zip/folder backup of the project.

## Project folder layout

```
project/
  proto.config.json     # screen order, start screen, device sizes
  global.css            # shared colors / fonts / spacing
  links.json            # prototype navigation (canonical store)
  screens/
    <Screen>/<Screen>.html, <Screen>.css
  exports/              # generated (Phase 5): standalone.html, PNGs
```

## Verification

- **Phase 1–3**: edit in-app and externally (Claude Code) and confirm the
  preview + editor stay in sync; device switching changes width only; overview
  shows all screens. ✅ confirmed with the user.
- **Phase 4** (to do): in Link mode, click an element, assign a target +
  transition, confirm `links.json` gets the entry; re-edit the HTML (reorder
  attributes, add a class) and confirm the link still resolves to the same
  element; run Play mode end-to-end with Back navigation.
- **Phase 5**: export standalone HTML, open via `file://` with the network
  disabled, confirm the prototype still plays.

## Key risks

1. Echo-detection-by-hash is load-bearing — a wrong call either fights the user
   on every keystroke or silently drops an external edit.
2. The stable-id heuristic is best-effort for *new* elements only (existing ids
   are never regenerated); wrapping an element in a new container is the common
   thing that breaks naive position-based schemes.
3. The sandboxed iframe + postMessage protocol must stay pure message-passing —
   no assumed direct DOM access from parent into the iframe.
4. Standalone export must stay zero-build / zero-network from the start.
