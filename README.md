# CodeToUI Playground

Write code to quickly build UI mockups and click-through prototypes. Type
HTML/CSS and see an instant live preview, build multiple screens, switch device
sizes, get an overview board of everything, and wire up no-code navigation
between screens — all over a plain folder of files on disk.

The core idea: **your project is just files**. The app is a live-reloading
preview and editor on top of that folder, and it doesn't care *who* edits the
files. You can type in the built-in editor, or point an AI coding tool
(Claude Code, Claude Desktop, OpenAI's Codex CLI) at the same folder and
dictate changes with your voice — the preview always reflects what's on disk.

---

## Requirements

- **[Node.js](https://nodejs.org) 18 or newer** (includes `npm`).
- A modern browser (Chrome or Safari).

That's it — no account, no API keys, nothing runs in the cloud. Everything is
local.

## Download & run

There are two ways to use it: a **desktop app** (double-click, no terminal), or
**run from source** (for development).

### Option A — Desktop app (recommended for most people)

Download the installer for your platform from the repo's
[Releases](#) page, then:

- **macOS** — open the `.dmg` and drag the app to Applications.
- **Windows** — run the `.exe` installer.

On first launch it creates an editable **projects folder** at
**`Documents/CodeToUI Playground`** (one subfolder per project, seeded with a
`Demo`) — that's the folder to point Claude Code / Codex CLI at.

> ⚠️ **Unsigned app warning.** These builds are **not code-signed** (code-signing
> certificates cost money, and we're skipping them for now). Your OS will warn
> that the app is from an unidentified developer. This is expected — nothing is
> wrong with the download. To open it anyway:
>
> - **macOS** — right-click (or Control-click) the app → **Open** → **Open**
>   again in the dialog. (Double-clicking alone will refuse the first time.) If
>   macOS still blocks it, go to **System Settings → Privacy & Security** and
>   click **Open Anyway**.
> - **Windows** — on the blue "Windows protected your PC" (SmartScreen) dialog,
>   click **More info → Run anyway**.
>
> Only do this because you trust the source of this download. If you obtained
> the installer from somewhere other than this project's own releases, don't.

### Option B — Run from source

```bash
# 1. Get the code (clone, or download the ZIP from the repo and unzip it)
git clone <this-repo-url> codetoui-playground
cd codetoui-playground

# 2. Install dependencies (one time)
npm install

# 3. Start the app
npm run dev
```

Then open the URL it prints (usually **http://localhost:5173**) in your
browser. Leave the terminal running while you work; stop it with `Ctrl+C`.
In this mode projects live in the `projects/` folder inside the repo.

### Building the desktop app yourself

```bash
npm install
npm run app:build:mac    # build the macOS .dmg + .zip (run on a Mac)
npm run app:build:win    # build the Windows installer (run on Windows)
```

Installers land in the `release/` (electron-builder `dist`) output folder.
Build each platform's installer **on that platform** — cross-building (e.g. a
Windows installer from macOS) needs extra tooling and isn't set up here. The
resulting apps are unsigned; see the warning above.

## Using the app

- **Projects** — the sidebar shows the current project at the top; click it to
  open the Projects manager, where you can switch between projects, create a new
  one, or delete one. Each project is its own folder of screens.
- **Screens / pages** — the left sidebar lists your screens. Click one to open
  it. Type a name in **New page** and hit **+** to add one; hover a screen and
  click **×** to delete it (links to/from it are cleaned up).
- **Editor tabs** — edit the screen's **HTML**, **CSS**, **JS** (per-screen
  JavaScript for interactivity, runs in the preview), or the shared
  **Global CSS** (colors, fonts, spacing used across all screens).
- **Insert** — the **+ Insert** tab opens a menu of common elements (div,
  paragraph, heading, button, input, list, …) that drop a snippet into the HTML
  at your cursor.
- **Saving** — edits **auto-save** to disk (that's how external tools see them
  live). Toggle **Auto-save: On/Off** in the top bar; with it off, use the
  **Save** button (it highlights when there are unsaved changes) or **⌘/Ctrl+S**.
- **Device sizes** — the top bar switches the preview between **Full**, phone,
  tablet, and desktop widths.
- **Zoom & pan** — use the **−/+** buttons (top-left of the preview) or
  Ctrl+scroll / trackpad pinch to zoom; toggle the **✋ hand** button
  (top-right) and drag to pan, or just two-finger scroll.
- **Hide code** — collapse the editor to give the preview the full width.
- **Pop out** — open the preview in its own window (great for a second
  monitor); it stays live. Pop it back in anytime.
- **Overview** — see all screens as thumbnails on one board; click one to jump
  to it.
- **Link** — wire up navigation without code: click **Link**, click an element
  in the preview, then choose:
  - **Go to** — a screen, or a special target: **← Back** (previous screen /
    close overlay) or **⌂ Home** (the start screen).
  - **Open** — **Navigate** (replace the screen) or **Overlay** (open the
    target on top as a modal with a dimmed backdrop; tap outside to close).
  - **Transition** — instant, dissolve, or slide left/right/up/down.

  Linked elements get a green outline. Links are stored in `links.json`, keyed
  to stable element ids so they survive HTML edits.
- **Play** — click **Play** to run the prototype full-screen: clicking linked
  elements navigates (or opens overlays), **← Back** steps back / closes
  overlays, **Flash hotspots** highlights every clickable area, and **Esc**
  exits.
- **Theme** — the **☾/☀** button toggles light/dark; your choice is remembered.
- **Colors** — the **Colors** button opens a pixel-styled picker (saturation/value
  square + hue bar) with RGB/HEX fields and a gradient builder: add as many
  color stops as you like, choose **linear / radial / conic** (and
  **repeating**), and set the angle. Copy any value (HEX, `rgb(...)`, or the
  full `*-gradient(...)`) to the clipboard to paste into your CSS.
- **Export** — the **Export** button opens a modal. Pick which pages to
  include, then export: a self-contained **Prototype** (`.html`, plays offline
  by just opening it), the **Code** (`.zip` of HTML/CSS + `links.json`), or
  **PDF** (via your browser's Save-as-PDF, one page each). Image / mockup-frame
  / GIF / MP4 exports are coming (they need a headless-render pipeline).
- **Pixel pet** — hatch a companion at the bottom of the sidebar; it bobs
  around, reacts when you pet it, and drops quips, app tips, and context-aware
  nudges. You can keep **up to two** pets (they stack), and you can **rehome** a
  pet to make room — pets go to a new home, never deleted. (Creatures are emoji
  placeholders for now; a "Pixel pet" hatch option is coming soon.)

## How projects are stored

Projects live under a **projects root** — `projects/` in the repo when running
from source, or `Documents/CodeToUI Playground` in the desktop app. Each project
is its own folder of readable files you (or an AI tool) can edit directly:

```
projects/
  Demo/
    proto.config.json     # screen order, start screen, device sizes
    global.css            # shared colors / fonts / spacing
    links.json            # prototype link data (used by Link/Play mode)
    screens/
      Login/
        Login.html
        Login.css
        Login.js        # optional — per-screen interactivity
      Home/
        Home.html
        Home.css
```

- **Add a screen** by creating a new folder under `screens/` with a matching
  `.html` and `.css` file — the app picks it up automatically.
- Open the same files in **Claude Code** / **Codex CLI** / any editor while the
  app is running: the preview updates live, and the built-in editor adopts the
  change (or shows a non-destructive "changed on disk" banner if you had unsaved
  edits, so nothing you typed is ever lost).

## License

Licensed under **Creative Commons Attribution-NonCommercial 4.0
(CC BY-NC 4.0)**. You're free to use, share, and adapt it for
**non-commercial** purposes, with attribution. See [LICENSE](./LICENSE).
