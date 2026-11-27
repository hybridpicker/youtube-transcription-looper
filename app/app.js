import { Engine } from "./engine.js";
import { buildPeaks, noteSpectrum, strongestNotes, guessChord, encodeWav, NOTE_LOW, NOTE_HIGH } from "./analysis.js";

const $ = (id) => document.getElementById(id);
const { clamp, fmt, parseTime, tickStep, NAMES } = globalThis.TL;
const I18N = globalThis.TL_I18N;
const { t, num } = I18N;

const RULER = 22; // px, time ruler at the top of the waveform
const MIN_LOOP = 0.03; // seconds
const HANDLE_GRAB = 7; // px
const NOTE_COUNT = NOTE_HIGH - NOTE_LOW + 1;
const COLORS = { accent: "#f4b740", wave: "#5f7385", waveDim: "#3c4a57", line: "#2a333c", text: "#e8edf2", muted: "#8b98a5", bg: "#171c21" };

const engine = new Engine();
const S = {
  key: null,
  name: "",
  duration: 0,
  peaks: null,
  peakScale: 1,
  loop: { a: null, b: null, on: false },
  speed: 100,
  semis: 0,
  cents: 0,
  gap: 0,
  chan: 0,
  low: 0,
  high: 1000,
  items: [],
  notes: "",
  view: { start: 0, end: 1 }
};
const G = { volume: 100, names: null, lang: null };
// Note naming follows the language unless the user picked one (B or H).
const nameSet = () => G.names || (I18N.lang === "de" ? "de" : "intl");
let drag = null;
let specDirty = true;
const levels = new Float32Array(NOTE_COUNT);

// ---- helpers ---------------------------------------------------------------

let toastTimer = 0;
function toast(message, ms = 2600) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => (el.hidden = true), ms);
}

function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

const hasLoop = () => S.loop.a != null && S.loop.b != null && S.loop.b - S.loop.a >= MIN_LOOP;
const bandHz = (v) => 20 * 1000 ** (v / 1000);
const shift = () => S.semis + S.cents / 100;

// ---- persistence -----------------------------------------------------------

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("transcription-looper", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("kv").objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let saveTimer = 0;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}
function save() {
  try {
    localStorage.setItem("tl:global", JSON.stringify(G));
    if (!S.key) return;
    const { loop, speed, semis, cents, gap, chan, low, high, items, notes, view } = S;
    localStorage.setItem(S.key, JSON.stringify({ loop, speed, semis, cents, gap, chan, low, high, items, notes, view }));
  } catch { /* storage full or unavailable: the session just is not remembered */ }
}
function restore(key) {
  try {
    Object.assign(G, JSON.parse(localStorage.getItem("tl:global") || "{}"));
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

// ---- loading ---------------------------------------------------------------

async function loadFile(file, remember = true) {
  toast(t("loading", { name: file.name }), 0);
  let buffer;
  try {
    buffer = await engine.load(await file.arrayBuffer());
  } catch (error) {
    console.error(error);
    toast(t("badFile"), 5000);
    return;
  }
  save();
  S.key = `tl:file:${file.name}:${file.size}`;
  S.name = file.name;
  S.duration = buffer.duration;
  S.peaks = buildPeaks(buffer);
  let peak = 0.05;
  const top = S.peaks.levels[1];
  for (let i = 0; i < top.max.length; i++) peak = Math.max(peak, top.max[i], -top.min[i]);
  S.peakScale = 1 / peak;

  Object.assign(S, { loop: { a: null, b: null, on: false }, speed: 100, semis: 0, cents: 0, gap: 0, chan: 0, low: 0, high: 1000, items: [], notes: "", view: { start: 0, end: buffer.duration } });
  const saved = restore(S.key);
  if (saved) Object.assign(S, saved);
  S.view.end = clamp(S.view.end, MIN_LOOP, S.duration);
  S.view.start = clamp(S.view.start, 0, S.view.end - 0.02);

  $("drop").hidden = true;
  $("work").hidden = false;
  S.sampleRate = buffer.sampleRate;
  delete $("file-name").dataset.i18n;
  showFileInfo();
  $("total").textContent = ` / ${fmt(S.duration)}`;
  $("notes").value = S.notes;
  resizeCanvases();
  applyAll();
  renderItems();
  if (hasLoop()) engine.seek(S.loop.a);
  $("toast").hidden = true;
  if (remember && file.size < 400e6) idbSet("last-file", file).catch(() => {});
}

function applyAll() {
  setSpeed(S.speed);
  setPitch(S.semis, S.cents);
  setGap(S.gap);
  setChannel(S.chan);
  setBand(S.low, S.high);
  setVolume(G.volume);
  syncLoop();
  $("names").textContent = nameSet() === "de" ? t("namesH") : t("namesB");
}

function showFileInfo() {
  document.title = S.name ? `${S.name} – ${t("workstation")}` : t("workstation");
  if (!S.name) return;
  $("file-name").textContent = `${S.name} · ${fmt(S.duration, false)} ${t("minutes")} · ${num((S.sampleRate / 1000).toFixed(1))} kHz`;
}

// Fills all static texts in the current language and refreshes the dynamic ones.
function applyLanguage() {
  I18N.setLang(G.lang);
  document.documentElement.lang = I18N.lang;
  I18N.apply(document);
  $("lang").textContent = I18N.lang === "de" ? "EN" : "DE";
  $("play").setAttribute("aria-label", engine.playing ? t("pause") : t("play"));
  showFileInfo();
  if (!S.peaks) return;
  applyAll();
  renderItems();
}

// ---- settings --------------------------------------------------------------

function setSpeed(v) {
  S.speed = clamp(Math.round(v), 10, 200);
  $("speed").value = S.speed;
  $("speed-out").textContent = `${S.speed} %`;
  for (const b of $("speed-chips").children) b.classList.toggle("on", Number(b.dataset.v) === S.speed);
  engine.setParams(S.speed / 100, shift());
  saveSoon();
}

function setPitch(semis, cents) {
  S.semis = clamp(semis, -12, 12);
  S.cents = clamp(cents, -50, 50);
  $("cents").value = S.cents;
  $("pitch-out").textContent = S.semis === 0 ? "±0" : `${S.semis > 0 ? "+" : "−"}${Math.abs(S.semis)} ${t("semitoneUnit")}`;
  $("cents-out").textContent = `${S.cents > 0 ? "+" : ""}${S.cents} ${t("centUnit")}`;
  engine.setParams(S.speed / 100, shift());
  specDirty = true;
  saveSoon();
}

function setGap(v) {
  S.gap = v;
  $("gap").value = v;
  $("gap-out").textContent = `${num(v)} s`;
  engine.setGap(v);
  saveSoon();
}

function setChannel(mode) {
  S.chan = mode;
  $("channel").value = mode;
  engine.setChannelMode(mode);
  specDirty = true;
  saveSoon();
}

function setBand(low, high) {
  if (high - low < 60) {
    if (low !== S.low) low = Math.max(0, high - 60);
    else high = Math.min(1000, low + 60);
  }
  S.low = low;
  S.high = high;
  $("band-low").value = low;
  $("band-high").value = high;
  const full = low <= 0 && high >= 1000;
  const hz = (v) => { const f = bandHz(v); return f >= 1000 ? `${num((f / 1000).toFixed(1))} kHz` : `${Math.round(f)} Hz`; };
  $("band-out").textContent = full ? t("bandFull") : `${hz(low)} – ${hz(high)}`;
  for (const b of $("focus-chips").children) {
    const near = (v, target) => Math.abs(bandHz(v) / target - 1) < 0.01;
    b.classList.toggle("on", near(low, b.dataset.low) && near(high, b.dataset.high));
  }
  engine.setBand(low <= 0 ? 10 : bandHz(low), high >= 1000 ? 22000 : bandHz(high));
  saveSoon();
}

function setVolume(v) {
  G.volume = v;
  $("volume").value = v;
  $("vol-out").textContent = `${v} %`;
  engine.setVolume((v / 100) ** 2);
  saveSoon();
}

// ---- loop ------------------------------------------------------------------

function syncLoop(send = true) {
  const valid = hasLoop();
  if (!valid) S.loop.on = false;
  if (send) engine.setLoop(S.loop.on && valid, valid ? S.loop.a : 0, valid ? S.loop.b : S.duration);
  if (document.activeElement !== $("loop-a")) $("loop-a").value = fmt(S.loop.a);
  if (document.activeElement !== $("loop-b")) $("loop-b").value = fmt(S.loop.b);
  $("loop-a").classList.remove("bad");
  $("loop-b").classList.remove("bad");
  $("loop-toggle").classList.toggle("on", S.loop.on);
  for (const id of ["loop-prev", "loop-next", "loop-half", "loop-double", "loop-save", "export-loop", "zoom-loop"]) $(id).disabled = !valid;
  drawWave();
  saveSoon();
}

function setA(t) {
  S.loop.a = clamp(t, 0, S.duration - MIN_LOOP);
  if (S.loop.b != null && S.loop.b - S.loop.a < MIN_LOOP) S.loop.b = null;
  syncLoop();
}

function setB(t) {
  if (S.loop.a == null) S.loop.a = 0;
  if (t - S.loop.a < MIN_LOOP) {
    toast(t("endAfterStart"));
    return;
  }
  S.loop.b = clamp(t, 0, S.duration);
  S.loop.on = true;
  syncLoop();
}

function toggleLoop() {
  if (!hasLoop()) {
    toast(t("noLoopWave"));
    return;
  }
  S.loop.on = !S.loop.on;
  syncLoop();
}

function moveLoop(direction) {
  if (!hasLoop()) return;
  const length = S.loop.b - S.loop.a;
  const a = S.loop.a + direction * length;
  if (a < -0.001 || a > S.duration - MIN_LOOP) return;
  S.loop.a = Math.max(0, a);
  S.loop.b = Math.min(S.duration, S.loop.a + length);
  S.loop.on = true;
  syncLoop();
  engine.seek(S.loop.a);
  ensureVisible(S.loop.a, S.loop.b);
}

function scaleLoop(factor) {
  if (!hasLoop()) return;
  const length = Math.max(MIN_LOOP, (S.loop.b - S.loop.a) * factor);
  S.loop.b = Math.min(S.duration, S.loop.a + length);
  syncLoop();
}

function nudgeLoop(edge, delta) {
  if (!hasLoop()) return;
  if (edge === "a") S.loop.a = clamp(S.loop.a + delta, 0, S.loop.b - MIN_LOOP);
  else S.loop.b = clamp(S.loop.b + delta, S.loop.a + MIN_LOOP, S.duration);
  syncLoop();
}

function restart() {
  engine.seek(hasLoop() ? S.loop.a : 0);
  engine.play(true);
}

// Starting playback with an active loop always begins at its start;
// without a loop it just continues.
function togglePlay() {
  if (engine.playing) return engine.play(false);
  if (S.loop.on && hasLoop()) engine.seek(S.loop.a);
  engine.play(true);
}

// ---- view ------------------------------------------------------------------

function setView(start, end) {
  let span = clamp(end - start, 0.02, S.duration);
  start = clamp(start, 0, S.duration - span);
  S.view = { start, end: start + span };
  drawWave();
  saveSoon();
}

function zoom(factor, around) {
  const { start, end } = S.view;
  const span = end - start;
  if (around == null) around = engine.pos >= start && engine.pos <= end ? engine.pos : start + span / 2;
  const rel = (around - start) / span;
  const next = clamp(span * factor, 0.02, S.duration);
  setView(around - rel * next, around - rel * next + next);
}

function ensureVisible(a, b) {
  const { start, end } = S.view;
  if (a >= start && b <= end) return;
  const span = end - start;
  if (b - a < span * 0.9) setView((a + b) / 2 - span / 2, (a + b) / 2 + span / 2);
  else zoomToLoop(a, b);
}

function zoomToLoop(a = S.loop.a, b = S.loop.b) {
  if (a == null || b == null) return;
  const pad = (b - a) * 0.08;
  setView(a - pad, b + pad);
}

const waveBox = $("wave-box");
const timeToX = (t) => ((t - S.view.start) / (S.view.end - S.view.start)) * waveBox.clientWidth;
const xToTime = (x) => clamp(S.view.start + (x / waveBox.clientWidth) * (S.view.end - S.view.start), 0, S.duration);

function resizeCanvases() {
  const dpr = window.devicePixelRatio || 1;
  for (const id of ["wave", "overview", "spectrum"]) {
    const c = $(id);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (w && h && (c.width !== w || c.height !== h)) {
      c.width = w;
      c.height = h;
    }
  }
  overviewCache = null;
  drawWave();
  specDirty = true;
}

// Min/max of the mono mix between two sample positions.
function minMax(s0, s1) {
  const { mono, levels: lv } = S.peaks;
  const total = mono[0].length;
  s0 = clamp(Math.floor(s0), 0, total - 1);
  s1 = clamp(Math.ceil(s1), s0 + 1, total);
  let lo = 1, hi = -1;
  if (s1 - s0 < 128) {
    const a = mono[0], b = mono[1];
    for (let i = s0; i < s1; i++) {
      const v = 0.5 * (a[i] + b[i]);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }
  const level = s1 - s0 < 4096 ? lv[0] : lv[1];
  const i0 = Math.floor(s0 / level.block), i1 = Math.min(level.min.length, Math.ceil(s1 / level.block));
  for (let i = i0; i < i1; i++) {
    if (level.min[i] < lo) lo = level.min[i];
    if (level.max[i] > hi) hi = level.max[i];
  }
  return [lo, hi];
}

function drawWave() {
  if (!S.peaks) return;
  const c = $("wave");
  const ctx = c.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = c.width, H = c.height;
  if (!W || !H) return;
  const { start, end } = S.view;
  const span = end - start;
  const sr = engine.sampleRate;
  const px = (t) => ((t - start) / span) * W;
  const ruler = RULER * dpr;
  ctx.clearRect(0, 0, W, H);

  const { a, b, on } = S.loop;
  const valid = a != null && b != null;
  if (valid) {
    ctx.fillStyle = on ? "rgba(244,183,64,.12)" : "rgba(255,255,255,.05)";
    ctx.fillRect(px(a), ruler, px(b) - px(a), H - ruler);
  }

  // Waveform, one column per device pixel.
  const mid = ruler + (H - ruler) / 2;
  const amp = ((H - ruler) / 2 - 4 * dpr) * S.peakScale;
  const xa = valid ? px(a) : -1, xb = valid ? px(b) : -1;
  let prevLo = NaN, prevHi = NaN;
  for (const inside of [false, true]) {
    ctx.fillStyle = inside ? (on ? COLORS.accent : "#8fa3b5") : valid && on ? COLORS.waveDim : COLORS.wave;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const t0 = start + (x / W) * span, t1 = start + ((x + 1) / W) * span;
      if (t1 < 0 || t0 > S.duration) continue;
      if ((valid && x >= xa && x < xb) !== inside) { prevLo = prevHi = NaN; continue; }
      let [lo, hi] = minMax(t0 * sr, t1 * sr);
      const rawLo = lo, rawHi = hi;
      if (prevLo === prevLo) { lo = Math.min(lo, prevHi); hi = Math.max(hi, prevLo); }
      prevLo = rawLo; prevHi = rawHi;
      const y0 = mid - hi * amp, y1 = mid - lo * amp;
      ctx.rect(x, y0, 1, Math.max(dpr, y1 - y0));
    }
    ctx.fill();
    prevLo = prevHi = NaN;
  }

  // Ruler
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.fillRect(0, 0, W, ruler);
  const pxPerSec = W / dpr / span;
  const step = tickStep(pxPerSec);
  ctx.font = `${11 * dpr}px ui-monospace, Menlo, monospace`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.muted;
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = dpr;
  ctx.beginPath();
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
    const x = Math.round(px(t)) + 0.5;
    ctx.moveTo(x, ruler - 6 * dpr);
    ctx.lineTo(x, ruler);
    const label = step < 1 ? fmt(t + 1e-6) : fmt(t + 1e-6, false);
    ctx.fillText(label, x + 4 * dpr, ruler / 2);
  }
  ctx.stroke();

  // Saved places
  S.items.forEach((item, index) => {
    if (item.type === "loop") {
      ctx.fillStyle = "rgba(244,183,64,.55)";
      ctx.fillRect(px(item.a), ruler - 3 * dpr, Math.max(dpr, px(item.b) - px(item.a)), 3 * dpr);
      return;
    }
    const x = Math.round(px(item.t));
    if (x < -20 || x > W + 20) return;
    ctx.fillStyle = "#7fd4a8";
    ctx.fillRect(x, ruler, dpr, H - ruler);
    const label = String(index + 1);
    const w = (ctx.measureText(label).width + 8 * dpr);
    ctx.fillRect(x, ruler, w, 14 * dpr);
    ctx.fillStyle = "#0f1215";
    ctx.fillText(label, x + 4 * dpr, ruler + 7.5 * dpr);
  });

  // Loop handles
  const handle = (t, label, alignRight) => {
    const x = Math.round(px(t));
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(x - (alignRight ? dpr : 0), ruler, dpr * 1.5, H - ruler);
    const w = 16 * dpr, h = 16 * dpr;
    const bx = alignRight ? x - w : x;
    ctx.fillRect(bx, H - h, w, h);
    ctx.fillStyle = "#1b1403";
    ctx.font = `700 ${11 * dpr}px system-ui, sans-serif`;
    ctx.fillText(label, bx + 4.5 * dpr, H - h / 2 + dpr);
  };
  if (a != null) handle(a, "A", false);
  if (b != null) handle(b, "B", true);
  drawOverview();
}

let overviewCache = null;
function drawOverview() {
  const c = $("overview");
  const W = c.width, H = c.height;
  if (!W || !H || !S.peaks) return;
  if (!overviewCache) {
    overviewCache = new OffscreenCanvas(W, H);
    const o = overviewCache.getContext("2d");
    o.fillStyle = COLORS.wave;
    const total = S.peaks.mono[0].length;
    const amp = (H / 2 - 2) * S.peakScale;
    for (let x = 0; x < W; x++) {
      const [lo, hi] = minMax((x / W) * total, ((x + 1) / W) * total);
      o.fillRect(x, H / 2 - hi * amp, 1, Math.max(1, (hi - lo) * amp));
    }
  }
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(overviewCache, 0, 0);
  const px = (t) => (t / S.duration) * W;
  if (S.loop.a != null && S.loop.b != null) {
    ctx.fillStyle = S.loop.on ? "rgba(244,183,64,.35)" : "rgba(255,255,255,.14)";
    ctx.fillRect(px(S.loop.a), 0, Math.max(2, px(S.loop.b) - px(S.loop.a)), H);
  }
  ctx.fillStyle = "rgba(255,255,255,.10)";
  ctx.strokeStyle = "rgba(255,255,255,.55)";
  ctx.lineWidth = 1;
  const vx = px(S.view.start), vw = Math.max(3, px(S.view.end) - vx);
  ctx.fillRect(vx, 0, vw, H);
  ctx.strokeRect(vx + 0.5, 0.5, vw - 1, H - 1);
  ctx.fillStyle = "#ff5d5d";
  ctx.fillRect(px(engine.pos) - 1, 0, 2, H);
  overviewPos = engine.pos;
}
let overviewPos = -1;

// ---- waveform interaction ----------------------------------------------------

function handleAt(x) {
  if (S.loop.b != null && Math.abs(x - timeToX(S.loop.b)) <= HANDLE_GRAB) return "b";
  if (S.loop.a != null && Math.abs(x - timeToX(S.loop.a)) <= HANDLE_GRAB) return "a";
  return null;
}

waveBox.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const x = event.clientX - waveBox.getBoundingClientRect().left;
  const t = xToTime(x);
  if (event.shiftKey && hasLoop()) {
    const edge = Math.abs(t - S.loop.a) < Math.abs(t - S.loop.b) ? "a" : "b";
    nudgeLoop(edge, t - S.loop[edge]);
    return;
  }
  const edge = handleAt(x);
  drag = edge ? { mode: edge } : { mode: "pending", x0: x, t0: t };
  waveBox.setPointerCapture(event.pointerId);
});

waveBox.addEventListener("pointermove", (event) => {
  const x = event.clientX - waveBox.getBoundingClientRect().left;
  if (!drag) {
    waveBox.style.cursor = handleAt(x) ? "ew-resize" : "crosshair";
    return;
  }
  const t = xToTime(x);
  if (drag.mode === "pending") {
    if (Math.abs(x - drag.x0) < 4) return;
    drag.mode = "select";
  }
  if (drag.mode === "select") {
    S.loop.a = Math.min(drag.t0, t);
    S.loop.b = Math.max(drag.t0, t);
  } else if (drag.mode === "a") {
    S.loop.a = S.loop.b == null ? t : clamp(t, 0, S.loop.b - MIN_LOOP);
  } else {
    S.loop.b = clamp(t, (S.loop.a ?? 0) + MIN_LOOP, S.duration);
  }
  syncLoop(false);
});

function endDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (d.mode === "pending") {
    engine.seek(d.t0);
    return;
  }
  if (d.mode === "select") {
    if (!hasLoop()) {
      S.loop.a = S.loop.b = null;
      syncLoop();
      engine.seek(d.t0);
      return;
    }
    S.loop.on = true;
  }
  syncLoop();
}
waveBox.addEventListener("pointerup", endDrag);
waveBox.addEventListener("pointercancel", endDrag);

waveBox.addEventListener("wheel", (event) => {
  event.preventDefault();
  const span = S.view.end - S.view.start;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    const dt = (event.deltaX / waveBox.clientWidth) * span;
    setView(S.view.start + dt, S.view.end + dt);
  } else {
    const x = event.clientX - waveBox.getBoundingClientRect().left;
    zoom(Math.exp(clamp(event.deltaY, -120, 120) * 0.004), xToTime(x));
  }
}, { passive: false });

const overview = $("overview");
function overviewSeek(event) {
  const rect = overview.getBoundingClientRect();
  const t = clamp((event.clientX - rect.left) / rect.width, 0, 1) * S.duration;
  const span = S.view.end - S.view.start;
  setView(t - span / 2, t + span / 2);
}
overview.addEventListener("pointerdown", (event) => { overview.setPointerCapture(event.pointerId); overviewSeek(event); });
overview.addEventListener("pointermove", (event) => { if (event.buttons & 1) overviewSeek(event); });

// ---- note spectrum -----------------------------------------------------------

const isBlack = (note) => [1, 3, 6, 8, 10].includes(note % 12);
const noteName = (note, octave = true) => NAMES[nameSet()][note % 12] + (octave ? Math.floor(note / 12) - 1 : "");
const KEYS_H = 40;

function drawSpectrum() {
  const c = $("spectrum");
  const ctx = c.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const W = c.width, H = c.height;
  if (!W || !H || !engine.buffer) return;
  noteSpectrum(engine.buffer, engine.pos, shift(), S.chan, levels);
  const strong = strongestNotes(levels);
  const strongSet = new Set(strong.map((s) => s.note));
  const chord = guessChord(levels);
  $("chord").textContent = chord ? `≈ ${NAMES[nameSet()][chord.root]}${chord.suffix}` : "";

  ctx.clearRect(0, 0, W, H);
  const keysH = KEYS_H * dpr, barsH = H - keysH - 16 * dpr, col = W / NOTE_COUNT;
  let top = -40;
  for (const v of levels) if (v > top) top = v;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < NOTE_COUNT; i++) {
    const note = NOTE_LOW + i;
    const x = i * col;
    const v = clamp((levels[i] - (top - 48)) / 48, 0, 1);
    const h = v * v * barsH;
    const on = strongSet.has(note);
    ctx.fillStyle = on ? COLORS.accent : "#4b5b69";
    ctx.fillRect(x + dpr, H - keysH - h - 2 * dpr, col - 2 * dpr, h);
    if (on) {
      ctx.font = `700 ${11 * dpr}px system-ui, sans-serif`;
      ctx.fillText(noteName(note), x + col / 2, H - keysH - h - 6 * dpr);
    }
    // Key
    const black = isBlack(note);
    ctx.fillStyle = on ? COLORS.accent : black ? "#07090b" : "#d5dbe1";
    ctx.fillRect(x + 0.5 * dpr, H - keysH, col - dpr, black ? keysH * 0.62 : keysH);
    if (black) {
      ctx.fillStyle = "#2a333c";
      ctx.fillRect(x + 0.5 * dpr, H - keysH * 0.38, col - dpr, keysH * 0.38);
    }
    if (note % 12 === 0) {
      ctx.fillStyle = "#39434d";
      ctx.font = `600 ${9 * dpr}px system-ui, sans-serif`;
      ctx.fillText(`C${note / 12 - 1}`, x + col / 2, H - 4 * dpr);
    }
  }
}

let stopTone = null;
const spectrum = $("spectrum");
spectrum.addEventListener("pointerdown", (event) => {
  const rect = spectrum.getBoundingClientRect();
  const index = clamp(Math.floor(((event.clientX - rect.left) / rect.width) * NOTE_COUNT), 0, NOTE_COUNT - 1);
  stopTone?.();
  stopTone = engine.startTone(440 * 2 ** ((NOTE_LOW + index - 69) / 12));
  spectrum.setPointerCapture(event.pointerId);
});
for (const type of ["pointerup", "pointercancel"]) spectrum.addEventListener(type, () => { stopTone?.(); stopTone = null; });

// ---- saved places ------------------------------------------------------------

function sortItems() {
  S.items.sort((x, y) => (x.type === "loop" ? x.a : x.t) - (y.type === "loop" ? y.a : y.t));
}

function addItem(item) {
  S.items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), label: "", ...item });
  sortItems();
  renderItems();
  drawWave();
  saveSoon();
}

function recall(item) {
  if (item.type === "loop") {
    S.loop = { a: item.a, b: item.b, on: true };
    syncLoop();
    engine.seek(item.a);
    ensureVisible(item.a, item.b);
  } else {
    engine.seek(item.t);
    ensureVisible(item.t, item.t);
  }
}

function renderItems() {
  const list = $("items");
  list.textContent = "";
  $("items-empty").hidden = S.items.length > 0;
  S.items.forEach((item, index) => {
    const li = document.createElement("li");
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = index < 9 ? index + 1 : "·";
    const when = document.createElement("span");
    when.className = `when ${item.type}`;
    when.textContent = item.type === "loop" ? `${fmt(item.a)} – ${fmt(item.b)}` : fmt(item.t);
    const label = document.createElement("input");
    label.value = item.label;
    label.placeholder = item.type === "loop" ? t("nameLoop") : t("nameMarker");
    label.addEventListener("input", () => { item.label = label.value; saveSoon(); });
    label.addEventListener("click", (event) => event.stopPropagation());
    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "×";
    del.title = t("delete");
    del.addEventListener("click", (event) => {
      event.stopPropagation();
      S.items = S.items.filter((other) => other !== item);
      renderItems();
      drawWave();
      saveSoon();
    });
    li.append(num, when, label, del);
    li.addEventListener("click", () => recall(item));
    list.append(li);
  });
}

// ---- frame loop ----------------------------------------------------------------

let lastClock = "";
let lastSpecTime = 0;
let lastSpecPos = -1;
function frame(now) {
  requestAnimationFrame(frame);
  if (!S.peaks) return;
  const pos = engine.pos;
  const text = fmt(pos);
  if (text !== lastClock) $("time").textContent = lastClock = text;

  const { start, end } = S.view;
  const span = end - start;
  if (engine.playing && !drag && (pos > end - span * 0.02 || pos < start) && span < S.duration) {
    setView(pos - span * 0.08, pos - span * 0.08 + span);
  }
  const x = timeToX(pos);
  const head = $("playhead");
  head.style.visibility = x < 0 || x > waveBox.clientWidth ? "hidden" : "visible";
  head.style.transform = `translateX(${x}px)`;
  if (Math.abs(pos - overviewPos) * (overview.clientWidth / S.duration) >= 1) drawOverview();

  if (now - lastSpecTime > 70 && (specDirty || pos !== lastSpecPos)) {
    lastSpecTime = now;
    lastSpecPos = pos;
    specDirty = false;
    drawSpectrum();
  }
}

// ---- wiring --------------------------------------------------------------------

engine.addEventListener("state", () => {
  $("play").classList.toggle("on", engine.playing);
  $("play").setAttribute("aria-label", engine.playing ? t("pause") : t("play"));
});

const pickFile = () => $("file-input").click();
$("open").onclick = pickFile;
$("open-2").onclick = pickFile;
$("file-input").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) loadFile(file);
  event.target.value = "";
});
window.addEventListener("dragover", (event) => { event.preventDefault(); document.body.classList.add("dragging"); });
window.addEventListener("dragleave", () => document.body.classList.remove("dragging"));
window.addEventListener("drop", (event) => {
  event.preventDefault();
  document.body.classList.remove("dragging");
  const file = event.dataTransfer.files[0];
  if (file) loadFile(file);
});

$("play").onclick = () => togglePlay();
$("restart").onclick = restart;
$("loop-toggle").onclick = toggleLoop;
$("set-a").onclick = () => setA(engine.pos);
$("set-b").onclick = () => setB(engine.pos);
$("loop-prev").onclick = () => moveLoop(-1);
$("loop-next").onclick = () => moveLoop(1);
$("loop-half").onclick = () => scaleLoop(0.5);
$("loop-double").onclick = () => scaleLoop(2);
$("loop-clear").onclick = () => { S.loop = { a: null, b: null, on: false }; syncLoop(); };
$("loop-save").onclick = saveLoop;
function saveLoop() {
  if (!hasLoop()) return;
  addItem({ type: "loop", a: S.loop.a, b: S.loop.b });
  toast(t("loopSaved"));
}
for (const [id, edge] of [["loop-a", "a"], ["loop-b", "b"]]) {
  $(id).addEventListener("change", (event) => {
    const value = parseTime(event.target.value);
    const other = edge === "a" ? S.loop.b : S.loop.a;
    const ok = value != null && value <= S.duration && (other == null || (edge === "a" ? other - value : value - other) >= MIN_LOOP);
    if (!ok) {
      event.target.classList.add("bad");
      return;
    }
    S.loop[edge] = value;
    if (hasLoop()) S.loop.on = true;
    event.target.blur();
    syncLoop();
  });
}

$("zoom-in").onclick = () => zoom(0.5);
$("zoom-out").onclick = () => zoom(2);
$("zoom-loop").onclick = () => zoomToLoop();
$("zoom-fit").onclick = () => setView(0, S.duration);

$("speed").addEventListener("input", (event) => setSpeed(Number(event.target.value)));
$("speed-chips").addEventListener("click", (event) => { if (event.target.dataset.v) setSpeed(Number(event.target.dataset.v)); });
$("gap").addEventListener("input", (event) => setGap(Number(event.target.value)));
$("pitch-down").onclick = () => setPitch(S.semis - 1, S.cents);
$("pitch-up").onclick = () => setPitch(S.semis + 1, S.cents);
$("pitch-oct-down").onclick = () => setPitch(S.semis - 12, S.cents);
$("pitch-oct-up").onclick = () => setPitch(S.semis + 12, S.cents);
$("pitch-reset").onclick = () => setPitch(0, 0);
$("cents").addEventListener("input", (event) => setPitch(S.semis, Number(event.target.value)));
$("channel").addEventListener("change", (event) => setChannel(Number(event.target.value)));
$("focus-chips").addEventListener("click", (event) => {
  const { low, high } = event.target.dataset;
  if (!low) return;
  const toSlider = (hz) => Math.round((1000 * Math.log(hz / 20)) / Math.log(1000));
  setBand(toSlider(Number(low)), toSlider(Number(high)));
});
$("band-low").addEventListener("input", (event) => setBand(Number(event.target.value), S.high));
$("band-high").addEventListener("input", (event) => setBand(S.low, Number(event.target.value)));
$("volume").addEventListener("input", (event) => setVolume(Number(event.target.value)));
$("names").onclick = () => {
  G.names = nameSet() === "de" ? "intl" : "de";
  $("names").textContent = G.names === "de" ? t("namesH") : t("namesB");
  specDirty = true;
  saveSoon();
};

function showTab(notes) {
  $("tab-items").classList.toggle("active", !notes);
  $("tab-notes").classList.toggle("active", notes);
  $("items-view").hidden = notes;
  $("notes-view").hidden = !notes;
}
$("tab-items").onclick = () => showTab(false);
$("tab-notes").onclick = () => { showTab(true); $("notes").focus(); };
$("add-marker").onclick = () => { addItem({ type: "marker", t: engine.pos }); showTab(false); };
$("export-loop").onclick = () => {
  if (!hasLoop()) return;
  const base = S.name.replace(/\.[^.]+$/, "");
  download(encodeWav(engine.buffer, S.loop.a, S.loop.b), `${base}_${fmt(S.loop.a).replace(":", "-")}_${fmt(S.loop.b).replace(":", "-")}.wav`);
};
$("notes").addEventListener("input", (event) => { S.notes = event.target.value; saveSoon(); });
function insertStamp() {
  const area = $("notes");
  area.focus();
  area.setRangeText(`[${fmt(engine.pos)}] `, area.selectionStart, area.selectionEnd, "end");
  S.notes = area.value;
  saveSoon();
}
$("stamp").onclick = insertStamp;
$("export-notes").onclick = () => download(new Blob([S.notes], { type: "text/plain;charset=utf-8" }), `${S.name.replace(/\.[^.]+$/, "")}_${t("notesFile")}.txt`);
$("help-btn").onclick = () => $("help").showModal();
$("lang").onclick = () => {
  G.lang = I18N.lang === "de" ? "en" : "de";
  applyLanguage();
  saveSoon();
};

window.addEventListener("keydown", (event) => {
  if (!S.peaks || event.metaKey || event.ctrlKey || $("help").open) return;
  const target = event.target;
  const typing = target.tagName === "TEXTAREA" || (target.tagName === "INPUT" && target.type !== "range");
  if (typing) {
    if (event.key === "Escape") target.blur();
    else if (event.shiftKey && event.code === "Space") togglePlay();
    else if (event.shiftKey && event.key === "Enter" && target.tagName === "TEXTAREA") restart();
    else if (event.altKey && event.code === "KeyT" && target.tagName === "TEXTAREA") insertStamp();
    else return;
    event.preventDefault();
    return;
  }
  const coarse = event.shiftKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  switch (key) {
    case " ": togglePlay(); break;
    case "Enter": restart(); break;
    case "ArrowLeft": engine.seek(engine.pos - (event.altKey ? 0.1 : coarse ? 5 : 1)); break;
    case "ArrowRight": engine.seek(engine.pos + (event.altKey ? 0.1 : coarse ? 5 : 1)); break;
    case "ArrowUp": setSpeed(S.speed + 5); break;
    case "ArrowDown": setSpeed(S.speed - 5); break;
    case "a": setA(engine.pos); break;
    case "b": setB(engine.pos); break;
    case "l": toggleLoop(); break;
    case ",": case ";": moveLoop(-1); break;
    case ".": case ":": moveLoop(1); break;
    case "h": scaleLoop(0.5); break;
    case "d": scaleLoop(2); break;
    case "q": nudgeLoop("a", coarse ? -0.1 : -0.02); break;
    case "w": nudgeLoop("a", coarse ? 0.1 : 0.02); break;
    case "e": nudgeLoop("b", coarse ? -0.1 : -0.02); break;
    case "r": nudgeLoop("b", coarse ? 0.1 : 0.02); break;
    case "+": case "*": setPitch(S.semis + 1, S.cents); break;
    case "-": case "_": setPitch(S.semis - 1, S.cents); break;
    case "m": addItem({ type: "marker", t: engine.pos }); break;
    case "s": saveLoop(); break;
    case "z": zoomToLoop(); break;
    case "f": setView(0, S.duration); break;
    case "?": $("help").showModal(); break;
    default:
      if (/^[1-9]$/.test(key) && S.items[key - 1]) { recall(S.items[key - 1]); break; }
      return;
  }
  event.preventDefault();
  if (target.tagName === "BUTTON") target.blur();
});

new ResizeObserver(resizeCanvases).observe(waveBox);
new ResizeObserver(resizeCanvases).observe($("spectrum"));
window.addEventListener("beforeunload", save);
requestAnimationFrame(frame);

restore("tl:global");
applyLanguage();
idbGet("last-file").then((file) => { if (file && !S.peaks) loadFile(file, false); }).catch(() => {});
