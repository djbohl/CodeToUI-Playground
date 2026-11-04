Here’s the plan: a design-only CodePen with a no-code prototyping layer on top.
What it is
You type HTML and CSS on the left and see the result instantly on the right. You make several screens, and instead of coding interactions, you click an element in the preview and pick which screen it should go to.
Core pieces
Editor and live preview: A code editor (CodeMirror) with an HTML tab and a CSS tab per screen. The preview is a sandboxed iframe that re-renders as you type, with a short debounce. Tailwind can be a toggle if you prefer utility classes.
Screens: A sidebar lists your screens (Login, Home, Settings). Each one has its own HTML and CSS plus a shared global CSS file for colors, fonts, and spacing, so the screens stay consistent.
Device sizes: A switcher for phone, tablet, and desktop widths, so you can check a design at each size.
Overview board: A zoomed-out view with all screens side by side as scaled-down previews, like Figma’s canvas, but read-only. You still edit by typing.
The no-code prototype layer
A “Link” mode injects a small script into the preview. Hovering highlights elements, and clicking one selects it.
You pick a target screen from a dropdown and a transition (none, fade, slide left, slide up).
The link is stored as data, not code: { element: "#login-btn", goes-to: "Home", transition: "slide-left" }. Elements get stable IDs automatically so links survive edits.
Optionally, you can write data-goto="Home" in your HTML for the same effect, if you ever prefer typing it.
Play mode runs the prototype full screen: clicks follow your links, a back gesture works, and a toggle flashes the clickable areas.
Saving and sharing
The project autosaves in the browser (a JSON file of screens and links).
Export options: PNG per screen, one standalone HTML file that plays the prototype, and project JSON for backup.
Build order
Editor plus live preview for one screen.
Multiple screens, global CSS, and device sizes.
Overview board.
Link mode and Play mode (the biggest piece).
Export and polish.
Step 1 and 2 alone already give you the “just type the design” workflow. Step 4 is what makes it feel like a prototyping tool.
Decision for you: I can build the first version as a single-page web app you open from a link, or as a local project on your computer that you can keep extending. The single page is faster to try. The local project is better if you want to grow it.
