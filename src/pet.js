// A little pixel companion that lives at the bottom of the sidebar. Hatches
// from an egg into a random (placeholder) creature, bobs around, and pipes up
// with quips and app tips. The PETS entries are emoji placeholders meant to be
// swapped for real pixel sprites later -- see swapping note below.

const STORE_KEY = "codetoui-pet";

// Placeholder creatures. To use real pixel art later, replace `emoji` with an
// <img>/sprite: change renderPet() to set innerHTML instead of textContent.
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
  "Tip: Press Esc to exit Play mode.",
  "Tip: Edit files with Claude Code — the preview updates live.",
  "Tip: The Colors tool copies hex, rgb, and gradients.",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function initPet() {
  const dock = document.getElementById("pet-dock");
  if (!dock) return;
  const bubbleEl = document.getElementById("pet-bubble");
  const spriteEl = document.getElementById("pet-sprite");
  const captionEl = document.getElementById("pet-caption");
  const hatchEl = document.getElementById("pet-hatch");

  let state = load();
  let bubbleTimer = null;
  let speakTimer = null;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  function speak(text) {
    bubbleEl.textContent = text;
    bubbleEl.hidden = false;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => (bubbleEl.hidden = true), 5500);
  }

  function scheduleChatter() {
    clearTimeout(speakTimer);
    const delay = 12000 + Math.random() * 12000;
    speakTimer = setTimeout(() => {
      // Lean slightly toward tips so the pet stays useful.
      speak(Math.random() < 0.55 ? pick(TIPS) : pick(QUIPS));
      scheduleChatter();
    }, delay);
  }

  function bounce(animClass) {
    spriteEl.classList.remove("jump", "hatching");
    // reflow so the animation can replay
    void spriteEl.offsetWidth;
    spriteEl.classList.add(animClass);
    spriteEl.addEventListener(
      "animationend",
      () => spriteEl.classList.remove(animClass),
      { once: true }
    );
  }

  function renderEgg() {
    spriteEl.textContent = "🥚";
    spriteEl.classList.add("egg");
    captionEl.textContent = "A mysterious egg…";
    hatchEl.hidden = false;
    bubbleEl.hidden = true;
    clearTimeout(speakTimer);
  }

  function renderPet() {
    const pet = PETS[state.i] || PETS[0];
    spriteEl.textContent = pet.emoji;
    spriteEl.classList.remove("egg");
    captionEl.textContent = `${state.name} the ${pet.kind}`;
    hatchEl.hidden = true;
    scheduleChatter();
  }

  function hatch() {
    const i = Math.floor(Math.random() * PETS.length);
    state = { i, name: pick(NAMES) };
    save();
    renderPet();
    bounce("hatching");
    speak(`Hi! I'm ${state.name}. Let's build something!`);
  }

  hatchEl.addEventListener("click", hatch);
  spriteEl.addEventListener("click", () => {
    if (!state) {
      hatch();
      return;
    }
    bounce("jump");
    speak(Math.random() < 0.5 ? pick(QUIPS) : pick(TIPS));
    scheduleChatter();
  });

  if (state) {
    renderPet();
    // a quiet welcome-back after a beat
    setTimeout(() => speak(`${state.name} missed you!`), 1500);
  } else {
    renderEgg();
  }
}
