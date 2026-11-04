// A little pixel companion that lives at the bottom of the sidebar. Hatches
// from an egg into a (placeholder) creature, bobs around, and pipes up with
// quips, app tips, and context-aware nudges. Up to two pets can be kept; they
// stack upward above the dashed divider. Pets are never deleted — they're
// rehomed to a new home.
//
// The PETS entries are emoji placeholders meant to be swapped for real pixel
// sprites later: replace `emoji` and switch renderPetUnit() from textContent
// to an <img>. When real sprites exist, enable the "Pixel pet" hatch option
// (currently "coming soon").

const STORE_KEY = "codetoui-pet";
const MAX_PETS = 2;

const PETS = [
  { emoji: "👾", kind: "Invader" },
  { emoji: "🐣", kind: "Chick" },
  { emoji: "🦖", kind: "Rexie" },
  { emoji: "🐙", kind: "Squish" },
  { emoji: "🐸", kind: "Hopper" },
  { emoji: "🦄", kind: "Sparkle" },
  { emoji: "🐲", kind: "Draggo" },
  { emoji: "🤖", kind: "Botling" },
];

const NAMES = [
  "Pixel", "Boop", "Nibble", "Zap", "Waffles", "Mochi",
  "Gizmo", "Taco", "Sprout", "Bit", "Noodle", "Pip",
];

const QUIPS = [
  "Boop!",
  "I live in your sidebar now.",
  "Pixels taste like... pixels.",
  "Are we shipping yet?",
  "I saw you center that div. Legendary.",
  "404: nap not found.",
  "Pretty sure that button needs more glow.",
  "You + me = pixel dream team.",
  "I believe in your prototype.",
  "Ship it! ...or pet me again.",
  "Beep boop, design mode engaged.",
  "That gradient? Chef's kiss.",
];

const TIPS = [
  "Tip: Hit Play to click through your prototype.",
  "Tip: Ctrl+scroll or pinch to zoom the preview.",
  "Tip: In Link mode, click an element to wire up navigation.",
  "Tip: Toggle ☾/☀ for light and dark.",
  "Tip: Pop the preview out onto a second monitor.",
  "Tip: Open → Overlay makes a link pop up as a modal.",
  "Tip: Link targets can be ← Back or ⌂ Home.",
  "Tip: Flash hotspots in Play to see what's clickable.",
  "Tip: Switch or make projects from the top of this sidebar.",
  "Tip: The Colors tool copies hex, rgb, and gradients.",
  "Tip: Gradients can be radial or conic now, with many stops.",
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function initPet({ getContext } = {}) {
  const dock = document.getElementById("pet-dock");
  if (!dock) return { react() {} };

  let pets = load(); // array of { i, name }
  const units = []; // parallel to pets: { bubbleEl, spriteEl, captionEl }
  let bubbleTimers = [];
  let chatterTimer = null;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (Array.isArray(raw)) return raw.slice(0, MAX_PETS);
      if (raw && typeof raw.i === "number") return [raw]; // migrate old single-pet
    } catch {
      /* ignore */
    }
    return [];
  }
  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(pets));
  }

  function speak(idx, text) {
    const u = units[idx];
    if (!u) return;
    u.bubbleEl.textContent = text;
    u.bubbleEl.hidden = false;
    clearTimeout(bubbleTimers[idx]);
    bubbleTimers[idx] = setTimeout(() => (u.bubbleEl.hidden = true), 5500);
  }

  function bounce(idx, animClass) {
    const sprite = units[idx]?.spriteEl;
    if (!sprite) return;
    sprite.classList.remove("jump", "hatching");
    void sprite.offsetWidth; // reflow to replay
    sprite.classList.add(animClass);
    sprite.addEventListener("animationend", () => sprite.classList.remove(animClass), {
      once: true,
    });
  }

  // Build a context-aware line, or null if nothing applies.
  function contextualLine() {
    if (!getContext) return null;
    let c;
    try {
      c = getContext();
    } catch {
      return null;
    }
    const cands = [];
    if (c.screenCount >= 2 && c.linkCount === 0)
      cands.push(`You've got ${c.screenCount} screens but no links — try Link mode to connect them!`);
    if (c.screenCount === 1)
      cands.push("Add another screen, then link between them to prototype a flow.");
    if (c.linkCount > 0 && !c.everPlayed)
      cands.push("Your links are ready — hit Play to click through them!");
    if (c.linkMode)
      cands.push("Click any element in the preview to give it a link.");
    return cands.length ? pick(cands) : null;
  }

  function scheduleChatter() {
    clearTimeout(chatterTimer);
    if (pets.length === 0) return;
    chatterTimer = setTimeout(() => {
      const idx = Math.floor(Math.random() * pets.length);
      const ctx = Math.random() < 0.5 ? contextualLine() : null;
      speak(idx, ctx || (Math.random() < 0.5 ? pick(TIPS) : pick(QUIPS)));
      scheduleChatter();
    }, 12000 + Math.random() * 12000);
  }

  // --- rendering ---
  function render() {
    dock.innerHTML = "";
    units.length = 0;
    bubbleTimers = [];

    // Newest pet on top: render in reverse so index order stays stable.
    for (let idx = pets.length - 1; idx >= 0; idx--) {
      units[idx] = renderPetUnit(idx);
    }
    if (pets.length < MAX_PETS) renderAddUnit();
  }

  function renderPetUnit(idx) {
    const pet = PETS[pets[idx].i] || PETS[0];
    const unit = document.createElement("div");
    unit.className = "pet";

    const bubbleEl = document.createElement("div");
    bubbleEl.className = "pet-bubble";
    bubbleEl.hidden = true;

    const stage = document.createElement("div");
    stage.className = "pet-stage";
    const spriteEl = document.createElement("button");
    spriteEl.className = "pet-sprite";
    spriteEl.title = "Pet me";
    spriteEl.textContent = pet.emoji;
    spriteEl.addEventListener("click", () => {
      bounce(idx, "jump");
      const ctx = Math.random() < 0.4 ? contextualLine() : null;
      speak(idx, ctx || (Math.random() < 0.5 ? pick(QUIPS) : pick(TIPS)));
      scheduleChatter();
    });
    stage.appendChild(spriteEl);

    const captionEl = document.createElement("div");
    captionEl.className = "pet-caption";
    captionEl.textContent = `${pets[idx].name} the ${pet.kind}`;

    const rehomeBtn = document.createElement("button");
    rehomeBtn.className = "pet-rehome";
    rehomeBtn.textContent = "Rehome";
    rehomeBtn.title = "Send this pet to a new home";
    rehomeBtn.addEventListener("click", () => rehome(idx));

    unit.append(bubbleEl, stage, captionEl, rehomeBtn);
    dock.appendChild(unit);
    return { bubbleEl, spriteEl, captionEl };
  }

  function renderAddUnit() {
    const unit = document.createElement("div");
    unit.className = "pet pet-add";

    const stage = document.createElement("div");
    stage.className = "pet-stage";
    const egg = document.createElement("button");
    egg.className = "pet-sprite egg";
    egg.textContent = "🥚";
    egg.title = "Hatch an egg";
    egg.addEventListener("click", hatchEgg);
    stage.appendChild(egg);

    const caption = document.createElement("div");
    caption.className = "pet-caption";
    caption.textContent = pets.length === 0 ? "A mysterious egg…" : "Room for one more…";

    const choice = document.createElement("div");
    choice.className = "pet-choice";
    const eggBtn = document.createElement("button");
    eggBtn.className = "topbar-btn";
    eggBtn.textContent = "Hatch egg";
    eggBtn.addEventListener("click", hatchEgg);
    const pixelBtn = document.createElement("button");
    pixelBtn.className = "topbar-btn";
    pixelBtn.textContent = "Pixel pet 🔒";
    pixelBtn.disabled = true;
    pixelBtn.title = "Coming soon";
    const soon = document.createElement("span");
    soon.className = "pet-soon";
    soon.textContent = "coming soon";
    choice.append(eggBtn, pixelBtn, soon);

    unit.append(stage, caption, choice);
    dock.appendChild(unit);
  }

  // --- actions ---
  function hatchEgg() {
    if (pets.length >= MAX_PETS) return;
    const i = Math.floor(Math.random() * PETS.length);
    pets.push({ i, name: pick(NAMES) });
    save();
    render();
    const newIdx = pets.length - 1;
    bounce(newIdx, "hatching");
    speak(newIdx, `Hi! I'm ${pets[newIdx].name}. Let's build something!`);
    scheduleChatter();
  }

  function rehome(idx) {
    const name = pets[idx].name;
    if (!confirm(`Rehome ${name} to a new home? They'll be happy and cared for. 🏡`)) return;
    // Show a gentle send-off on that pet, then let them go to their new home.
    speak(idx, `🏡 ${name} is off to a loving new home. Bye! 👋`);
    const unit = units[idx];
    if (unit) unit.spriteEl.classList.add("leaving");
    setTimeout(() => {
      pets.splice(idx, 1);
      save();
      render();
      scheduleChatter();
    }, 1600);
  }

  function react(event) {
    if (pets.length === 0) return;
    const lines = {
      linkSaved: "Nice — that's linked! 🎉 Try Play to test it.",
      screenAdded: "Ooh, a new screen! More to prototype.",
    };
    const text = lines[event];
    if (!text) return;
    bounce(0, "jump");
    speak(0, text);
    scheduleChatter();
  }

  render();
  if (pets.length > 0) {
    scheduleChatter();
    setTimeout(() => speak(0, `${pets[0].name} missed you!`), 1500);
  }

  return { react };
}
