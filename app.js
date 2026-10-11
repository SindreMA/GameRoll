// ARC Raiders maps. Add new ones here when Embark ships them.
// `rarity` is just the CS-style colour bar under each case tile.
const MAPS = [
  { id: "dam", name: "Dam Battlegrounds", blurb: "Flooded valley around the old hydro dam", rarity: "blue" },
  { id: "spaceport", name: "Spaceport", blurb: "Launch towers and wide open tarmac", rarity: "purple" },
  { id: "buried", name: "Buried City", blurb: "Sand-swallowed streets and rooftops", rarity: "blue" },
  { id: "bluegate", name: "The Blue Gate", blurb: "Mountain pass, tunnels and checkpoints", rarity: "pink" },
  { id: "stella", name: "Stella Montis", blurb: "Research facility up in the snow", rarity: "purple" },
  { id: "riven", name: "Riven Tides", blurb: "Coastline, the Exodus port and Panorama Azzurro", rarity: "red" },
  { id: "pendola", name: "Pendola Pass", blurb: "Mountain village and old Exodus transit hub", rarity: "gold" },
];

const CHALLENGES = [
  "Free loadouts only",
  "Grey and green gear only",
  "No shields",
  "Melee and pistols only",
  "Extract within 15 minutes",
  "Don't shoot first — only return fire",
  "Loot only one named location",
  "Take down an ARC bigger than a Wasp before extracting",
  "Everyone brings the same weapon",
  "No healing items, only bandages you find",
  "Help the first raider you meet",
  "Stay together — nobody more than 50 m apart",
  "Last extract, ride the clock",
  "Quiet run: no grenades or explosives",
  "Only loot containers you haven't opened before",
];

const STORE_KEY = "gameroll:arc";
const STRIP_LEN = 60;
const DEFAULT_WEIGHT = 50;
const SPIN_MS = 6000;

const reel = document.getElementById("reel");
const reelBg = document.getElementById("reelBg");
const caseEl = document.getElementById("case");
const strip = document.getElementById("strip");
const reelName = document.getElementById("reelName");
const reelMeta = document.getElementById("reelMeta");
const rollBtn = document.getElementById("rollBtn");
const mapList = document.getElementById("mapList");
const optNoRepeat = document.getElementById("optNoRepeat");
const optChallenge = document.getElementById("optChallenge");
const optSound = document.getElementById("optSound");
const optVolume = document.getElementById("optVolume");
const challengeBox = document.getElementById("challengeBox");
const challengeText = document.getElementById("challengeText");
const historyPanel = document.getElementById("historyPanel");
const historyEl = document.getElementById("history");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const imgUrl = (map) => `img/${map.id}.webp`;
// Warm the cache so tiles don't pop in blank mid-spin.
for (const map of MAPS) new Image().src = imgUrl(map);

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // storage blocked; settings just won't persist
  }
}

const saved = load();
const state = {
  // Store what's switched off, so maps added later start out enabled.
  disabled: Array.isArray(saved.disabled) ? saved.disabled : [],
  noRepeat: saved.noRepeat ?? true,
  challenge: saved.challenge ?? false,
  sound: saved.sound ?? true,
  volume: typeof saved.volume === "number" ? saved.volume : 0.35,
  // Missing entries fall back to DEFAULT_WEIGHT, so new maps get normal odds.
  weights: saved.weights && typeof saved.weights === "object" ? saved.weights : {},
  history: Array.isArray(saved.history) ? saved.history.slice(0, 10) : [],
};
let rolling = false;

function randInt(max) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function pick(list) {
  return list[randInt(list.length)];
}

function weightOf(map) {
  return state.weights[map.id] ?? DEFAULT_WEIGHT;
}

function pickWeighted(maps) {
  const total = maps.reduce((sum, m) => sum + weightOf(m), 0);
  let r = randInt(total);
  for (const m of maps) {
    r -= weightOf(m);
    if (r < 0) return m;
  }
  return maps[maps.length - 1];
}

/* ---------- Sound (CS:GO case sounds, played through Web Audio so ticks can overlap) ---------- */

const SOUNDS = ["open", "scroll", "reveal-rare", "reveal-mythical", "reveal-legendary", "reveal-ancient"];
const REVEAL = { blue: "reveal-rare", purple: "reveal-mythical", pink: "reveal-legendary", red: "reveal-ancient", gold: "reveal-ancient" };

let audio = null;
const buffers = new Map();
const decoding = new Map();
// Download up front; decoding needs an AudioContext, which browsers only allow after a user gesture.
const downloads = SOUNDS.map((name) =>
  fetch(`sfx/${name}.mp3`).then((r) => r.arrayBuffer()).catch(() => null)
);

function ac() {
  if (!state.sound) return null;
  if (!audio) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audio = new Ctx();
    SOUNDS.forEach((name, i) =>
      decoding.set(name, downloads[i]
        .then((data) => data && audio.decodeAudioData(data))
        .then((buf) => buf && buffers.set(name, buf))
        .catch(() => {})) // a broken sound just stays silent
    );
  }
  if (audio.state === "suspended") audio.resume();
  return audio;
}

// `wait` is for one-off sounds that should still play if decoding is a moment behind;
// ticks skip instead, so they never bunch up.
function play(name, vol = 0.6, wait = false) {
  const ctx = ac();
  if (!ctx) return;
  const buf = buffers.get(name);
  if (!buf) {
    if (wait) decoding.get(name)?.then(() => buffers.has(name) && play(name, vol));
    return;
  }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  gain.gain.value = vol * state.volume;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

const sfx = {
  tick: () => play("scroll", 0.45),
  open: () => play("open", 0.6, true),
  land: (map) => play(REVEAL[map.rarity] || "reveal-rare", 0.7, true),
};

/* ---------- Map pool ---------- */

function renderMaps() {
  mapList.innerHTML = "";
  for (const map of MAPS) {
    const li = document.createElement("li");
    li.className = "map";
    li.dataset.id = map.id;
    li.innerHTML = `<label><input type="checkbox"><span></span></label>
      <div class="odds"><input type="range" min="0" max="100" step="5"><output aria-live="off"></output></div>`;
    const input = li.querySelector("input");
    input.checked = !state.disabled.includes(map.id);
    const tile = li.querySelector("span");
    tile.textContent = map.name;
    tile.style.setProperty("--img", `url("${imgUrl(map)}")`);
    const slider = li.querySelector("input[type=range]");
    slider.value = weightOf(map);
    slider.setAttribute("aria-label", `${map.name} weight`);
    slider.addEventListener("input", () => {
      state.weights[map.id] = Number(slider.value);
      save();
      updateOdds();
      updateRollState();
    });
    slider.addEventListener("change", () => { if (!rolling) fillStrip(idleStrip()); });
    input.addEventListener("change", () => {
      state.disabled = input.checked
        ? state.disabled.filter((id) => id !== map.id)
        : [...state.disabled, map.id];
      save();
      updateOdds();
      updateRollState();
      if (!rolling) fillStrip(idleStrip());
    });
    mapList.appendChild(li);
  }
  updateOdds();
}

// Show each map's share of the total weight.
function updateOdds() {
  const p = pool();
  const total = p.reduce((sum, m) => sum + weightOf(m), 0);
  for (const li of mapList.children) {
    const map = MAPS.find((m) => m.id === li.dataset.id);
    const on = p.includes(map);
    const pct = on && total ? (weightOf(map) / total) * 100 : 0;
    li.querySelector("output").textContent = `${pct < 10 && pct > 0 ? pct.toFixed(1) : Math.round(pct)}%`;
    li.querySelector("input[type=range]").disabled = state.disabled.includes(map.id);
    li.classList.toggle("zero", weightOf(map) === 0);
  }
}

function pool() {
  return MAPS.filter((m) => !state.disabled.includes(m.id) && weightOf(m) > 0);
}

function updateRollState() {
  const n = pool().length;
  rollBtn.disabled = n === 0 || rolling;
  if (!rolling && !reel.classList.contains("landed")) {
    reelMeta.textContent = n === 0 ? "Turn on at least one map" : `${n} map${n === 1 ? "" : "s"} in the case`;
  }
}

function highlight(id) {
  for (const li of mapList.children) li.classList.toggle("hit", li.dataset.id === id);
}

/* ---------- Case strip ---------- */

function tileEl(map) {
  const el = document.createElement("div");
  el.className = `tile r-${map.rarity}`;
  el.style.setProperty("--img", `url("${imgUrl(map)}")`);
  const name = document.createElement("span");
  name.textContent = map.name;
  el.appendChild(name);
  return el;
}

function fillStrip(maps) {
  strip.style.transition = "none";
  strip.style.transform = "translateX(0)";
  strip.replaceChildren(...maps.map(tileEl));
}

function idleStrip() {
  const p = pool();
  return p.length ? Array.from({ length: 12 }, (_, i) => p[i % p.length]) : [];
}

function tileStep() {
  const first = strip.firstElementChild;
  if (!first) return 0;
  const gap = parseFloat(getComputedStyle(strip).columnGap) || 0;
  return first.offsetWidth + gap;
}

function currentX() {
  return new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41;
}

function chooseMap() {
  const candidates = pool();
  const last = state.history[0]?.map;
  if (state.noRepeat && candidates.length > 1) {
    return pickWeighted(candidates.filter((m) => m.id !== last));
  }
  return pickWeighted(candidates);
}

function roll() {
  if (rolling) return;
  const candidates = pool();
  if (candidates.length === 0) return;

  const winner = chooseMap();
  const challenge = state.challenge ? pick(CHALLENGES) : null;

  // Winner sits near the end of a long random strip, like a CS case.
  const winIndex = STRIP_LEN - 6 - randInt(4);
  const maps = Array.from({ length: STRIP_LEN }, () => pickWeighted(candidates));
  maps[winIndex] = winner;
  fillStrip(maps);

  rolling = true;
  rollBtn.disabled = true;
  challengeBox.hidden = true;
  highlight(null);
  reel.classList.remove("landed", "has-img");
  reel.classList.add("spinning");
  reelName.textContent = "Opening…";
  reelMeta.textContent = "";
  sfx.open();

  const step = tileStep();
  const center = caseEl.clientWidth / 2;
  // Land somewhere inside the winning tile, not dead centre, so it feels less scripted.
  const jitter = (Math.random() - 0.5) * step * 0.7;
  const target = -(winIndex * step + step / 2 - center + jitter);
  const duration = reduceMotion ? 600 : SPIN_MS;

  void strip.offsetWidth; // commit the reset before animating
  strip.style.transition = `transform ${duration}ms cubic-bezier(.12, .7, .14, 1)`;
  strip.style.transform = `translateX(${target}px)`;

  // Tick every time a tile edge passes the marker.
  let lastIdx = Math.floor(center / step);
  let raf = 0;
  const watch = () => {
    const idx = Math.floor((center - currentX()) / step);
    if (idx !== lastIdx) {
      lastIdx = idx;
      sfx.tick();
      const tile = strip.children[idx];
      if (tile) highlight(maps[idx].id);
    }
    raf = requestAnimationFrame(watch);
  };
  if (!reduceMotion) raf = requestAnimationFrame(watch);

  const done = () => {
    cancelAnimationFrame(raf);
    land(winner, challenge, strip.children[winIndex]);
  };
  strip.addEventListener("transitionend", done, { once: true });
}

function land(map, challenge, tile) {
  tile?.classList.add("won");
  reelName.textContent = map.name;
  reelMeta.textContent = map.blurb;
  reelBg.style.setProperty("--img", `url("${imgUrl(map)}")`);
  highlight(map.id);
  reel.classList.remove("spinning");
  reel.classList.add("landed", "has-img");
  sfx.land(map);

  if (challenge) {
    challengeText.textContent = challenge;
    challengeBox.hidden = false;
  }

  state.history.unshift({ map: map.id, challenge, at: Date.now() });
  state.history = state.history.slice(0, 10);
  save();
  renderHistory();

  rolling = false;
  updateRollState();
  rollBtn.focus({ preventScroll: true });
}

/* ---------- History ---------- */

function renderHistory() {
  historyPanel.hidden = state.history.length === 0;
  historyEl.innerHTML = "";
  for (const entry of state.history) {
    const map = MAPS.find((m) => m.id === entry.map);
    if (!map) continue;
    const li = document.createElement("li");
    const left = document.createElement("div");
    const name = document.createElement("span");
    name.className = "h-map";
    name.textContent = map.name;
    left.appendChild(name);
    if (entry.challenge) {
      const ch = document.createElement("span");
      ch.className = "h-ch";
      ch.textContent = entry.challenge;
      left.appendChild(ch);
    }
    const time = document.createElement("time");
    const d = new Date(entry.at);
    time.dateTime = d.toISOString();
    time.textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    li.append(left, time);
    historyEl.appendChild(li);
  }
}

/* ---------- Wiring ---------- */

function setAll(on) {
  state.disabled = on ? [] : MAPS.map((m) => m.id);
  save();
  renderMaps();
  updateRollState();
  if (!rolling) fillStrip(idleStrip());
}

optNoRepeat.checked = state.noRepeat;
optChallenge.checked = state.challenge;
optSound.checked = state.sound;
optVolume.value = Math.round(state.volume * 100);
optVolume.disabled = !state.sound;
optNoRepeat.addEventListener("change", () => { state.noRepeat = optNoRepeat.checked; save(); });
optChallenge.addEventListener("change", () => { state.challenge = optChallenge.checked; save(); });
optSound.addEventListener("change", () => {
  state.sound = optSound.checked;
  optVolume.disabled = !state.sound;
  save();
  if (state.sound) sfx.tick();
});
optVolume.addEventListener("input", () => { state.volume = optVolume.value / 100; save(); });
// Preview the new level once the slider is let go, not on every step.
optVolume.addEventListener("change", () => sfx.tick());
document.getElementById("evenBtn").addEventListener("click", () => {
  state.weights = {};
  save();
  renderMaps();
  updateRollState();
  if (!rolling) fillStrip(idleStrip());
});
document.getElementById("allBtn").addEventListener("click", () => setAll(true));
document.getElementById("noneBtn").addEventListener("click", () => setAll(false));
document.getElementById("clearBtn").addEventListener("click", () => {
  state.history = [];
  save();
  renderHistory();
});
rollBtn.addEventListener("click", roll);
// Any first interaction unlocks audio so sounds are decoded before the case opens.
document.addEventListener("pointerdown", () => ac(), { once: true });
document.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement?.tagName;
  if (e.code === "KeyF" && tag !== "INPUT") {
    e.preventDefault();
    toggleFullscreen();
    return;
  }
  if (e.code === "Escape" && document.body.classList.contains("fs") && !document.fullscreenElement) {
    setFsMode(false); // fallback mode has no native Esc handling
    return;
  }
  if (e.code !== "Space") return;
  if (tag === "INPUT" || tag === "BUTTON") return; // let native controls handle space
  e.preventDefault();
  roll();
});

/* ---------- Fullscreen ---------- */

const fsBtn = document.getElementById("fsBtn");
const fsLabel = document.getElementById("fsLabel");
const canFullscreen = !!document.documentElement.requestFullscreen;

function setFsMode(on) {
  document.body.classList.toggle("fs", on);
  fsLabel.textContent = on ? "Exit" : "Fullscreen";
  fsBtn.title = on ? "Exit fullscreen (F)" : "Fullscreen (F)";
  if (!rolling) fillStrip(idleStrip()); // tile size changes with the layout
}

function toggleFullscreen() {
  const on = !document.body.classList.contains("fs");
  // Without the Fullscreen API (iPhone Safari) we still switch to the big layout.
  if (!canFullscreen) return setFsMode(on);
  if (on) document.documentElement.requestFullscreen().catch(() => setFsMode(true));
  else if (document.fullscreenElement) document.exitFullscreen();
  else setFsMode(false);
}

document.addEventListener("fullscreenchange", () => setFsMode(!!document.fullscreenElement));
fsBtn.addEventListener("click", toggleFullscreen);

renderMaps();
renderHistory();
fillStrip(idleStrip());
updateRollState();
