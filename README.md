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

On first launch it creates an editable project folder at
**`Documents/CodeToUI Playground`** — that's the folder to point Claude Code /
Codex CLI at.

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
In this mode the project lives in the `project/` folder inside the repo.

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

- **Screens** — the left sidebar lists your screens. Click one to open it.
- **Editor tabs** — edit the screen's **HTML**, its **CSS**, or the shared
  **Global CSS** (colors, fonts, spacing used across all screens). Changes save
  automatically and the preview reloads.
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

## How a project is stored

Everything lives in the `project/` folder as readable files you (or an AI tool)
can edit directly:

```
project/
  proto.config.json     # screen order, start screen, device sizes
  global.css            # shared colors / fonts / spacing
  links.json            # prototype link data (used by Link/Play mode)
  screens/
    Login/
      Login.html
      Login.css
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
