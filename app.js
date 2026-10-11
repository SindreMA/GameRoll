// ARC Raiders maps. Add new ones here when Embark ships them.
const MAPS = [
  { id: "dam", name: "Dam Battlegrounds", blurb: "Flooded valley around the old hydro dam" },
  { id: "spaceport", name: "Spaceport", blurb: "Launch towers and wide open tarmac" },
  { id: "buried", name: "Buried City", blurb: "Sand-swallowed streets and rooftops" },
  { id: "bluegate", name: "The Blue Gate", blurb: "Mountain pass, tunnels and checkpoints" },
  { id: "stella", name: "Stella Montis", blurb: "Research facility up in the snow" },
  { id: "riven", name: "Riven Tides", blurb: "Coastline, the Exodus port and Panorama Azzurro" },
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
const reel = document.getElementById("reel");
const reelName = document.getElementById("reelName");
const reelMeta = document.getElementById("reelMeta");
const rollBtn = document.getElementById("rollBtn");
const mapList = document.getElementById("mapList");
const optNoRepeat = document.getElementById("optNoRepeat");
const optChallenge = document.getElementById("optChallenge");
const challengeBox = document.getElementById("challengeBox");
const challengeText = document.getElementById("challengeText");
const historyPanel = document.getElementById("historyPanel");
const historyEl = document.getElementById("history");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  enabled: Array.isArray(saved.enabled) ? saved.enabled : MAPS.map((m) => m.id),
  noRepeat: saved.noRepeat ?? true,
  challenge: saved.challenge ?? false,
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

function renderMaps() {
  mapList.innerHTML = "";
  for (const map of MAPS) {
    const li = document.createElement("li");
    li.className = "map";
    li.dataset.id = map.id;
    li.innerHTML = `<label><input type="checkbox"><span></span></label>`;
    const input = li.querySelector("input");
    input.checked = state.enabled.includes(map.id);
    li.querySelector("span").textContent = map.name;
    input.addEventListener("change", () => {
      state.enabled = MAPS.filter((m) =>
        m.id === map.id ? input.checked : state.enabled.includes(m.id)
      ).map((m) => m.id);
      save();
      updateRollState();
    });
    mapList.appendChild(li);
  }
}

function pool() {
  return MAPS.filter((m) => state.enabled.includes(m.id));
}

function updateRollState() {
  const n = pool().length;
  rollBtn.disabled = n === 0 || rolling;
  if (!rolling && reelName.textContent === "—") {
    reelMeta.textContent = n === 0 ? "Turn on at least one map" : `${n} map${n === 1 ? "" : "s"} in the pool`;
  }
}

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

function highlight(id) {
  for (const li of mapList.children) li.classList.toggle("hit", li.dataset.id === id);
}

function chooseMap() {
  const candidates = pool();
  const last = state.history[0]?.map;
  if (state.noRepeat && candidates.length > 1) {
    const filtered = candidates.filter((m) => m.id !== last);
    return pick(filtered);
  }
  return pick(candidates);
}

function roll() {
  if (rolling) return;
  const candidates = pool();
  if (candidates.length === 0) return;

  const winner = chooseMap();
  const challenge = state.challenge ? pick(CHALLENGES) : null;

  rolling = true;
  rollBtn.disabled = true;
  challengeBox.hidden = true;
  reel.classList.remove("landed");
  reel.classList.add("spinning");
  reelMeta.textContent = "Rolling…";

  // Ease out: ticks start fast and slow down before landing on the winner.
  const ticks = reduceMotion || candidates.length === 1 ? 0 : 18 + randInt(6);
  let i = 0;
  let prev = null;

  const step = () => {
    if (i >= ticks) return land(winner, challenge);
    let next = pick(candidates);
    if (candidates.length > 1) while (next === prev) next = pick(candidates);
    prev = next;
    reelName.textContent = next.name;
    highlight(next.id);
    i++;
    const t = i / ticks;
    setTimeout(step, 45 + Math.pow(t, 3) * 320);
  };
  step();
}

function land(map, challenge) {
  reelName.textContent = map.name;
  reelMeta.textContent = map.blurb;
  highlight(map.id);
  reel.classList.remove("spinning");
  void reel.offsetWidth; // restart the land animation
  reel.classList.add("landed");

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

function setAll(on) {
  state.enabled = on ? MAPS.map((m) => m.id) : [];
  save();
  renderMaps();
  updateRollState();
}

optNoRepeat.checked = state.noRepeat;
optChallenge.checked = state.challenge;
optNoRepeat.addEventListener("change", () => { state.noRepeat = optNoRepeat.checked; save(); });
optChallenge.addEventListener("change", () => { state.challenge = optChallenge.checked; save(); });
document.getElementById("allBtn").addEventListener("click", () => setAll(true));
document.getElementById("noneBtn").addEventListener("click", () => setAll(false));
document.getElementById("clearBtn").addEventListener("click", () => {
  state.history = [];
  save();
  renderHistory();
});
rollBtn.addEventListener("click", roll);
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat) return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "BUTTON") return; // let native controls handle space
  e.preventDefault();
  roll();
});

renderMaps();
renderHistory();
updateRollState();
