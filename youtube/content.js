// Transcription panel for YouTube: precise A/B loop, tempo, pitch, tone
// shaping, a live note display and saved places, docked under the player.
(() => {
  "use strict";

  const { clamp, fmt, parseTime, tickStep, NAMES, NOTE_LOW, NOTE_HIGH, strongestNotes, guessChord } = globalThis.TL;

  // A previous copy of this script survives an extension reload; replace it.
  window.__ytlInstance?.destroy();
  document.getElementById("ytl-panel")?.remove();
  document.getElementById("ytl-host")?.remove();

  const BUCKETS = 50; // level entries per second of video
  const MIN_LOOP = 0.03;
  const RULER = 20;
  const HANDLE_GRAB = 7;
  const NOTE_COUNT = NOTE_HIGH - NOTE_LOW + 1;
  const COLORS = { accent: "#f4b740", wave: "#5f7385", waveDim: "#3c4a57", line: "#2a333c", muted: "#8b98a5" };

  const fresh = () => ({ loop: { a: null, b: null, on: false }, speed: 100, semis: 0, cents: 0, gap: 0, chan: 0, low: 0, high: 1000, items: [] });
  let S = fresh();
  const G = { open: false, keys: true, names: "de", collapsed: false, place: "side", folded: {} };
  let video = null;
  let videoId = null;
  let duration = 0;
  let heard = null; // peak level per bucket, filled in while the video plays
  let view = { start: 0, end: 1 };
  let drag = null;
  let gapTimer = 0;
  let bindToken = 0;
  const abort = new AbortController();
  const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: abort.signal });

  // ---- storage -----------------------------------------------------------

  let saveTimer = 0;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const data = { "ytl:global": G };
        if (videoId) data[`ytl:v:${videoId}`] = S;
        chrome.storage.local.set(data).catch(() => {});
      } catch { /* extension was reloaded; this copy is about to be replaced */ }
    }, 400);
  }
  async function load(keys) {
    try { return await chrome.storage.local.get(keys); } catch { return {}; }
  }

  // ---- panel -------------------------------------------------------------

  const host = document.createElement("div");
  host.id = "ytl-host";
  host.hidden = true;
  const root = host.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(globalThis.TL_PANEL_CSS);
  root.adoptedStyleSheets = [sheet];
  root.innerHTML = `
    <div class="p" id="p">
      <div class="head">
        <span class="logo"></span><b>Transkriptions-Looper</b>
        <span class="hint" id="hint"></span>
        <button id="keys" class="btn ghost" title="Tastenkürzel des Loopers ein/aus. Aus: YouTubes eigene Tasten gelten wieder.">Tasten</button>
        <button id="help-btn" class="btn ghost" title="Tastenkürzel anzeigen">?</button>
        <button id="files" class="btn ghost" title="Werkstatt für Audiodateien in neuem Tab öffnen">Datei</button>
        <button id="place" class="btn ghost icon" title="Position wechseln: neben oder unter dem Video"></button>
        <button id="collapse" class="btn ghost icon" title="Regler ein-/ausklappen">▾</button>
        <button id="close" class="btn ghost icon" title="Looper schließen">×</button>
      </div>
      <div class="wave" id="wave-box"><canvas id="wave"></canvas><div id="playhead" class="playhead"></div></div>
      <div class="transport">
        <button id="play" class="play" title="Wiedergabe / Pause (Leertaste)" aria-label="Wiedergabe"></button>
        <button id="restart" class="btn icon" title="Zum Loop-Anfang (Enter)">⏮</button>
        <div class="clock"><span id="time">0:00.00</span><span class="muted" id="total"></span></div>
        <div class="group">
          <button id="loop-toggle" class="btn" title="Loop ein/aus (L)">Loop</button>
          <button id="set-a" class="btn" title="Anfang an der Abspielposition (A)">A</button>
          <input id="loop-a" class="time-input" inputmode="decimal" aria-label="Loop-Anfang" placeholder="–:––.––">
          <input id="loop-b" class="time-input" inputmode="decimal" aria-label="Loop-Ende" placeholder="–:––.––">
          <button id="set-b" class="btn" title="Ende an der Abspielposition (B)">B</button>
          <span class="sep"></span>
          <button id="loop-prev" class="btn icon" title="Loop um seine Länge zurück (,)">◀</button>
          <button id="loop-next" class="btn icon" title="Loop um seine Länge weiter (.)">▶</button>
          <button id="loop-half" class="btn" title="Loop halbieren (H)">½</button>
          <button id="loop-double" class="btn" title="Loop verdoppeln (D)">×2</button>
          <button id="loop-save" class="btn" title="Loop in die Liste speichern (S)"><span class="ic">★</span><span class="tx">Speichern</span></button>
          <button id="loop-clear" class="btn ghost" title="Loop entfernen"><span class="ic">✕</span><span class="tx">Entfernen</span></button>
        </div>
        <div class="group right">
          <button id="zoom-out" class="btn icon" title="Herauszoomen">−</button>
          <button id="zoom-in" class="btn icon" title="Hineinzoomen">+</button>
          <button id="zoom-loop" class="btn" title="Auf den Loop zoomen (Z)">Loop</button>
          <button id="zoom-fit" class="btn" title="Ganzes Video zeigen (F)">Alles</button>
        </div>
      </div>
      <div class="help more" id="help" hidden>
        <div><span><kbd>Leertaste</kbd></span><span>Wiedergabe / Pause</span></div>
        <div><span><kbd>Enter</kbd></span><span>Zum Loop-Anfang</span></div>
        <div><span><kbd>←</kbd> <kbd>→</kbd></span><span>1 s (Shift: 5 s, Alt: 0,1 s)</span></div>
        <div><span><kbd>A</kbd> <kbd>B</kbd></span><span>Loop-Anfang / -Ende setzen</span></div>
        <div><span><kbd>L</kbd></span><span>Loop ein / aus</span></div>
        <div><span><kbd>,</kbd> <kbd>.</kbd></span><span>Loop zurück / weiter schieben</span></div>
        <div><span><kbd>H</kbd> <kbd>D</kbd></span><span>Loop halbieren / verdoppeln</span></div>
        <div><span><kbd>Q</kbd> <kbd>W</kbd></span><span>Anfang früher / später</span></div>
        <div><span><kbd>E</kbd> <kbd>R</kbd></span><span>Ende früher / später</span></div>
        <div><span><kbd>↑</kbd> <kbd>↓</kbd></span><span>Tempo ±5 %</span></div>
        <div><span><kbd>+</kbd> <kbd>−</kbd></span><span>Tonhöhe ±1 Halbton</span></div>
        <div><span><kbd>M</kbd> <kbd>S</kbd></span><span>Marker / Loop speichern</span></div>
        <div><span><kbd>1</kbd>–<kbd>9</kbd></span><span>Gespeicherte Stelle</span></div>
        <div><span><kbd>Z</kbd> <kbd>F</kbd></span><span>Zoom auf Loop / alles</span></div>
        <p class="muted small">Zeitleiste: Klick = springen · Ziehen = Loop aufziehen · Shift+Klick = nächste Loop-Grenze versetzen · Strg/⌘+Mausrad = zoomen. Die Wellenform entsteht beim Abspielen.</p>
      </div>
      <div class="panels more">
        <div data-sec="tempo" class="panel">
          <div class="panel-head"><h2>Tempo</h2><output id="speed-out" class="reset" title="Klick: zurück auf 100 %">100 %</output></div>
          <input id="speed" type="range" min="10" max="200" step="1" value="100" aria-label="Tempo in Prozent">
          <div class="chips" id="speed-chips">
            <button data-v="25">25</button><button data-v="35">35</button><button data-v="50">50</button><button data-v="60">60</button>
            <button data-v="70">70</button><button data-v="80">80</button><button data-v="90">90</button><button data-v="100">100</button>
          </div>
          <div class="field" title="Pause zwischen den Loop-Durchläufen"><span>Pause</span>
            <input id="gap" type="range" min="0" max="5" step="0.25" value="0" aria-label="Pause zwischen Loop-Durchläufen"><output id="gap-out">0 s</output></div>
        </div>
        <div data-sec="pitch" class="panel">
          <div class="panel-head"><h2>Tonhöhe</h2><output id="pitch-out" class="reset" title="Klick: zurück auf Originaltonhöhe">±0</output></div>
          <div class="stepper">
            <button id="pitch-oct-down" class="btn" title="Oktave tiefer">−12</button>
            <button id="pitch-down" class="btn" title="Halbton tiefer">−1</button>
            <button id="pitch-reset" class="btn ghost">Original</button>
            <button id="pitch-up" class="btn" title="Halbton höher">+1</button>
            <button id="pitch-oct-up" class="btn" title="Oktave höher">+12</button>
          </div>
          <div class="field" title="Feinstimmung in Cent"><span>Fein</span>
            <input id="cents" type="range" min="-50" max="50" step="1" value="0" aria-label="Feinstimmung in Cent"><output id="cents-out">0 Cent</output></div>
        </div>
        <div data-sec="sound" class="panel">
          <div class="panel-head"><h2>Klang</h2>
            <select id="channel" aria-label="Kanal">
              <option value="0">Stereo</option><option value="1">Nur links</option><option value="2">Nur rechts</option>
              <option value="3">Mono</option><option value="4">Mitte entfernt</option>
            </select>
          </div>
          <div class="chips" id="focus-chips">
            <button data-low="20" data-high="20000">Alles</button><button data-low="20" data-high="260">Bass</button>
            <button data-low="200" data-high="2500">Mitten</button><button data-low="1800" data-high="20000">Höhen</button>
          </div>
          <div class="field band" title="Hörbarer Frequenzbereich: untere und obere Grenze"><span>Bereich</span>
            <div class="dual">
              <input id="band-low" type="range" min="0" max="1000" step="1" value="0" aria-label="Untere Grenzfrequenz">
              <input id="band-high" type="range" min="0" max="1000" step="1" value="1000" aria-label="Obere Grenzfrequenz">
            </div><output id="band-out">alles</output></div>
        </div>
      </div>
      <div class="bottom more">
        <div data-sec="notes" class="panel spec">
          <div class="panel-head"><h2>Töne (live)</h2>
            <div class="head-right"><span id="chord" class="chord" title="Geschätzter Akkord – nur ein Hinweis"></span>
              <button id="names" class="btn ghost" title="Notennamen umschalten">H</button></div>
          </div>
          <canvas id="spectrum"></canvas>
        </div>
        <div data-sec="places" class="panel">
          <div class="panel-head"><h2>Stellen</h2><button id="add-marker" class="btn" title="Marker an der Abspielposition (M)">+ Marker</button></div>
          <ol id="items" class="items"></ol>
          <span id="items-empty" class="muted small"><kbd>M</kbd> setzt einen Marker, <kbd>S</kbd> speichert den aktuellen Loop.</span>
        </div>
      </div>
    </div>`;
  const $ = (id) => root.getElementById(id);
  const waveBox = $("wave-box");

  // Preferred spot is the sidebar next to the player, so video and controls
  // are visible together. That only works in YouTube's two-column layout;
  // otherwise the panel goes under the player, or docks on non-watch pages.
  function mount() {
    const flexy = document.querySelector("ytd-watch-flexy");
    const below = flexy?.querySelector("#below");
    const secondary = flexy?.querySelector("#secondary-inner") || flexy?.querySelector("#secondary");
    let place = below ? "below" : "dock";
    if (below && secondary && G.place === "side" && !flexy.hasAttribute("theater") && !flexy.hasAttribute("fullscreen")) {
      const column = flexy.querySelector("#secondary").getBoundingClientRect();
      const primary = flexy.querySelector("#primary")?.getBoundingClientRect();
      if (primary && column.width >= 280 && column.left >= primary.right - 30) place = "side";
    }
    const parent = place === "side" ? secondary : place === "below" ? below : document.body;
    if (host.parentNode !== parent) parent.prepend(host);
    host.classList.toggle("side", place === "side");
    host.classList.toggle("dock", place === "dock");
    $("place").textContent = place === "side" ? "⬓" : "◨";
    $("place").hidden = place === "dock";
  }

  let hintTimer = 0;
  function hint(text, warn = false, ms = 0) {
    const el = $("hint");
    el.textContent = text;
    el.classList.toggle("warn", warn);
    clearTimeout(hintTimer);
    if (ms) hintTimer = setTimeout(statusHint, ms);
  }
  function statusHint() {
    if (!video) hint("Kein Video auf dieser Seite gefunden.");
    else if (audio.failed) hint("Klangbearbeitung nicht verfügbar – Tempo und Loop funktionieren. Seite neu laden hilft meist.", true);
    else if (!audio.ok) hint("Einmal ins Bedienfeld klicken, um Tonhöhe, Filter und Tonanzeige zu aktivieren.");
    else if (!audio.shift) hint("Tonhöhenänderung in diesem Tab nicht verfügbar.", true);
    else hint("");
  }

  // ---- video binding -------------------------------------------------------

  const onYouTube = /(^|\.)youtube\.com$/.test(location.hostname);
  function getVideo() {
    if (!onYouTube) return document.querySelector("video");
    // Only real player pages; the home page has hover previews we must not grab.
    if (!/^\/(watch|shorts\/|live\/|embed\/)/.test(location.pathname)) return null;
    return document.querySelector("#movie_player video.html5-main-video") || document.querySelector("video.html5-main-video");
  }
  const adShowing = () => Boolean(document.querySelector(".html5-video-player.ad-showing"));
  function currentId() {
    const url = new URL(location.href);
    const path = url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/);
    return url.searchParams.get("v") || (path && path[1]) || `page:${url.pathname}`;
  }

  async function bind() {
    const next = getVideo();
    const id = next ? currentId() : null;
    const length = next && Number.isFinite(next.duration) ? next.duration : 0;
    if (next === video && id === videoId && Math.abs(length - duration) < 0.5) return;
    if (next && (adShowing() || !length)) return; // wait for the real video
    const token = ++bindToken;
    if (video !== next) {
      if (video) {
        video.removeEventListener("timeupdate", enforceLoop);
        video.removeEventListener("ended", onEnded);
        if (appliedRate != null) {
          video.preservesPitch = true;
          video.playbackRate = 1;
        }
      }
      appliedRate = null;
      next?.addEventListener("timeupdate", enforceLoop);
      next?.addEventListener("ended", onEnded);
    }
    const sameVideo = id === videoId;
    video = next;
    videoId = id;
    duration = length;
    if (!video) {
      updateVisibility();
      return;
    }
    if (!sameVideo || !heard || heard.length !== Math.ceil(duration * BUCKETS) + 1) {
      heard = new Float32Array(Math.ceil(duration * BUCKETS) + 1);
    }
    if (!sameVideo) {
      const key = `ytl:v:${id}`;
      const saved = (await load(key))[key];
      if (token !== bindToken) return;
      S = Object.assign(fresh(), saved);
      view = { start: 0, end: duration };
    }
    view.end = clamp(view.end, 0.02, duration);
    view.start = clamp(view.start, 0, view.end - 0.02);
    $("total").textContent = ` / ${fmt(duration)}`;
    updateVisibility();
    refreshControls();
    renderItems();
    resize();
  }

  function updateVisibility() {
    const show = G.open && Boolean(video);
    if (show) mount();
    host.hidden = !show;
    $("p").classList.remove("empty");
    for (const panel of root.querySelectorAll("[data-sec]")) panel.classList.toggle("folded", Boolean(G.folded[panel.dataset.sec]));
    $("p").classList.toggle("collapsed", G.collapsed);
    $("collapse").textContent = G.collapsed ? "▸" : "▾";
    $("keys").classList.toggle("on", G.keys);
    applyPlayback();
    statusHint();
  }

  // ---- audio graph -----------------------------------------------------------

  const audio = { ctx: null, node: null, ok: false, shift: false, failed: false, starting: false, level: null, notes: null, filters: [], latency: 0 };

  // Must be called from a user gesture, otherwise the context stays suspended
  // and routing the video through it would silence the player.
  async function ensureAudio() {
    if (audio.ok || audio.failed || audio.starting || !video) return;
    audio.starting = true;
    let shared = window.__ytlAudio;
    try {
      if (!shared) shared = { ctx: new AudioContext({ latencyHint: "playback" }), sources: new WeakMap(), worklet: false };
      const ctx = shared.ctx;
      const running = await Promise.race([ctx.resume().then(() => true), new Promise((r) => setTimeout(() => r(false), 400))]);
      if (!running || ctx.state !== "running") {
        if (!window.__ytlAudio) ctx.close();
        audio.starting = false;
        return;
      }
      window.__ytlAudio = shared;
      let source = shared.sources.get(video);
      if (!source) {
        source = ctx.createMediaElementSource(video);
        shared.sources.set(video, source);
      }
      source.disconnect();
      audio.ctx = ctx;
      audio.source = source;
      audio.boundVideo = video;
      try {
        if (!shared.worklet) await ctx.audioWorklet.addModule(chrome.runtime.getURL("app/live-worklet.js"));
        shared.worklet = true;
        audio.node = new AudioWorkletNode(ctx, "live-shift", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit" });
        audio.node.port.onmessage = (event) => { audio.latency = event.data.latency; };
        audio.shift = true;
      } catch (error) {
        console.warn("[Transkriptions-Looper] Pitch engine unavailable:", error);
        audio.shift = false;
      }
      const filter = (type, frequency) => new BiquadFilterNode(ctx, { type, frequency, Q: 0.707 });
      audio.filters = [filter("highpass", 10), filter("highpass", 10), filter("lowpass", 22000), filter("lowpass", 22000)];
      audio.level = new AnalyserNode(ctx, { fftSize: 2048 });
      audio.notes = new AnalyserNode(ctx, { fftSize: 16384, smoothingTimeConstant: 0.55 });
      source.connect(audio.level);
      let tail = source;
      if (audio.shift) tail = source.connect(audio.node);
      tail.connect(audio.notes);
      for (const f of audio.filters) tail = tail.connect(f);
      tail.connect(ctx.destination);
      audio.ok = true;
    } catch (error) {
      console.warn("[Transkriptions-Looper] Audio processing unavailable:", error);
      audio.failed = true;
      // Never leave the player silent.
      try { audio.source?.connect(audio.ctx.destination); } catch { /* nothing more to do */ }
    }
    audio.starting = false;
    applyPlayback();
    refreshControls();
    statusHint();
  }

  const bandHz = (v) => 20 * 1000 ** (v / 1000);

  // Pushes tempo, pitch, channel and filter settings to the player. With the
  // panel closed (or during ads) everything is neutral.
  function applyPlayback() {
    if (!video) return;
    const active = G.open && !adShowing();
    const rate = active ? S.speed / 100 : null;
    const pitch = active ? 2 ** ((S.semis + S.cents / 100) / 12) : 1;
    const useShift = audio.ok && audio.shift && audio.boundVideo === video;
    if (rate != null) {
      video.preservesPitch = !useShift;
      if (Math.abs(video.playbackRate - rate) > 1e-3) video.playbackRate = rate;
    } else if (appliedRate != null) {
      video.preservesPitch = true;
      if (!adShowing()) video.playbackRate = 1;
    }
    appliedRate = rate;
    if (!audio.ok) return;
    if (audio.shift) {
      const slow = useShift && rate != null ? rate : 1;
      audio.node.port.postMessage({ ratio: useShift ? pitch / slow : 1, slow, mode: active ? S.chan : 0 });
    }
    const t = audio.ctx.currentTime;
    const low = active && S.low > 0 ? bandHz(S.low) : 10;
    const high = active && S.high < 1000 ? bandHz(S.high) : 22000;
    audio.filters[0].frequency.setTargetAtTime(low, t, 0.015);
    audio.filters[1].frequency.setTargetAtTime(low, t, 0.015);
    audio.filters[2].frequency.setTargetAtTime(high, t, 0.015);
    audio.filters[3].frequency.setTargetAtTime(high, t, 0.015);
  }
  let appliedRate = null;

  // ---- settings ----------------------------------------------------------------

  const hasLoop = () => S.loop.a != null && S.loop.b != null && S.loop.b - S.loop.a >= MIN_LOOP;

  function refreshControls() {
    $("speed").value = S.speed;
    $("speed-out").textContent = `${S.speed} %`;
    for (const b of $("speed-chips").children) b.classList.toggle("on", Number(b.dataset.v) === S.speed);
    $("gap").value = S.gap;
    $("gap-out").textContent = `${String(S.gap).replace(".", ",")} s`;
    $("cents").value = S.cents;
    $("pitch-out").textContent = S.semis === 0 ? "±0" : `${S.semis > 0 ? "+" : "−"}${Math.abs(S.semis)} HT`;
    $("cents-out").textContent = `${S.cents > 0 ? "+" : ""}${S.cents} Cent`;
    $("channel").value = S.chan;
    $("band-low").value = S.low;
    $("band-high").value = S.high;
    const hz = (v) => { const f = bandHz(v); return f >= 1000 ? `${(f / 1000).toFixed(1).replace(".", ",")} kHz` : `${Math.round(f)} Hz`; };
    $("band-out").textContent = S.low <= 0 && S.high >= 1000 ? "alles" : `${hz(S.low)} – ${hz(S.high)}`;
    const near = (v, target) => Math.abs(bandHz(v) / target - 1) < 0.01;
    for (const b of $("focus-chips").children) b.classList.toggle("on", near(S.low, b.dataset.low) && near(S.high, b.dataset.high));
    $("names").textContent = G.names === "de" ? "H" : "B";
    const noShift = audio.ok && !audio.shift;
    for (const id of ["pitch-oct-down", "pitch-down", "pitch-reset", "pitch-up", "pitch-oct-up", "cents", "channel"]) $(id).disabled = noShift;
    syncLoop();
  }

  function setSpeed(v) {
    S.speed = clamp(Math.round(v), 10, 200);
    applyPlayback();
    refreshControls();
    saveSoon();
  }
  function setPitch(semis, cents) {
    S.semis = clamp(semis, -12, 12);
    S.cents = clamp(cents, -50, 50);
    applyPlayback();
    refreshControls();
    saveSoon();
  }
  function setBand(low, high) {
    if (high - low < 60) {
      if (low !== S.low) low = Math.max(0, high - 60);
      else high = Math.min(1000, low + 60);
    }
    S.low = low;
    S.high = high;
    applyPlayback();
    refreshControls();
    saveSoon();
  }

  // ---- loop ------------------------------------------------------------------------

  function syncLoop() {
    const valid = hasLoop();
    if (!valid) S.loop.on = false;
    if (root.activeElement !== $("loop-a")) $("loop-a").value = fmt(S.loop.a);
    if (root.activeElement !== $("loop-b")) $("loop-b").value = fmt(S.loop.b);
    $("loop-a").classList.remove("bad");
    $("loop-b").classList.remove("bad");
    $("loop-toggle").classList.toggle("on", S.loop.on);
    for (const id of ["loop-prev", "loop-next", "loop-half", "loop-double", "loop-save", "zoom-loop"]) $(id).disabled = !valid;
    draw();
    saveSoon();
  }

  function seek(t) {
    if (!video) return;
    clearTimeout(gapTimer);
    gapTimer = 0;
    video.currentTime = clamp(t, 0, Math.max(0, duration - 0.05));
  }

  function enterLoop() {
    const t = video.currentTime;
    if (S.loop.on && hasLoop() && (t < S.loop.a || t >= S.loop.b)) seek(S.loop.a);
  }

  function setA(t) {
    S.loop.a = clamp(t, 0, duration - MIN_LOOP);
    if (S.loop.b != null && S.loop.b - S.loop.a < MIN_LOOP) S.loop.b = null;
    syncLoop();
  }
  function setB(t) {
    if (S.loop.a == null) S.loop.a = 0;
    if (t - S.loop.a < MIN_LOOP) {
      hint("Das Ende muss hinter dem Anfang liegen.", true, 2500);
      return;
    }
    S.loop.b = clamp(t, 0, duration);
    S.loop.on = true;
    syncLoop();
    enterLoop();
    focusLoop();
  }
  function toggleLoop() {
    if (!hasLoop()) {
      hint("Erst in der Zeitleiste einen Bereich aufziehen oder A und B setzen.", true, 3000);
      return;
    }
    S.loop.on = !S.loop.on;
    syncLoop();
    enterLoop();
  }
  function moveLoop(direction) {
    if (!hasLoop()) return;
    const length = S.loop.b - S.loop.a;
    const a = S.loop.a + direction * length;
    if (a < -0.001 || a > duration - MIN_LOOP) return;
    S.loop.a = Math.max(0, a);
    S.loop.b = Math.min(duration, S.loop.a + length);
    S.loop.on = true;
    syncLoop();
    seek(S.loop.a);
    ensureVisible(S.loop.a, S.loop.b);
  }
  function scaleLoop(factor) {
    if (!hasLoop()) return;
    S.loop.b = Math.min(duration, S.loop.a + Math.max(MIN_LOOP, (S.loop.b - S.loop.a) * factor));
    syncLoop();
    enterLoop();
    focusLoop();
  }
  function nudgeLoop(edge, delta) {
    if (!hasLoop()) return;
    if (edge === "a") S.loop.a = clamp(S.loop.a + delta, 0, S.loop.b - MIN_LOOP);
    else S.loop.b = clamp(S.loop.b + delta, S.loop.a + MIN_LOOP, duration);
    syncLoop();
    enterLoop();
  }
  function restart() {
    seek(hasLoop() ? S.loop.a : 0);
    video.play().catch(() => {});
  }
  function togglePlay() {
    if (gapTimer) {
      clearTimeout(gapTimer);
      gapTimer = 0;
      return;
    }
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  // Runs every animation frame and on timeupdate (which keeps firing in a
  // background tab, where animation frames stop).
  function enforceLoop() {
    if (!video || !G.open || !S.loop.on || !hasLoop() || video.seeking || gapTimer || adShowing()) return;
    const t = video.currentTime;
    const lead = 0.03 * video.playbackRate;
    if (t < S.loop.b - lead || t > S.loop.b + 1) return;
    if (S.gap > 0 && !video.paused) {
      video.pause();
      video.currentTime = S.loop.a;
      gapTimer = setTimeout(() => {
        gapTimer = 0;
        video.play().catch(() => {});
      }, S.gap * 1000);
    } else {
      video.currentTime = S.loop.a;
    }
  }
  function onEnded() {
    if (G.open && S.loop.on && hasLoop() && S.loop.b >= duration - 1) {
      video.currentTime = S.loop.a;
      video.play().catch(() => {});
    }
  }

  // ---- timeline ----------------------------------------------------------------------

  const timeToX = (t) => ((t - view.start) / (view.end - view.start)) * waveBox.clientWidth;
  const xToTime = (x) => clamp(view.start + (x / waveBox.clientWidth) * (view.end - view.start), 0, duration);

  function setView(start, end) {
    const span = clamp(end - start, 0.5, duration);
    start = clamp(start, 0, duration - span);
    view = { start, end: start + span };
    draw();
  }
  function zoom(factor, around) {
    const span = view.end - view.start;
    const t = video.currentTime;
    if (around == null) around = t >= view.start && t <= view.end ? t : view.start + span / 2;
    const rel = (around - view.start) / span;
    const next = clamp(span * factor, 0.5, duration);
    setView(around - rel * next, around - rel * next + next);
  }
  function zoomToLoop(a = S.loop.a, b = S.loop.b) {
    if (a == null || b == null) return;
    const pad = Math.max(0.25, (b - a) * 0.08);
    setView(a - pad, b + pad);
  }
  // A freshly defined loop gets the timeline to itself, with room on both
  // sides to drag the handles. Without this a loop in a long video is a sliver.
  function focusLoop() {
    if (!hasLoop()) return;
    const length = S.loop.b - S.loop.a;
    const span = view.end - view.start;
    const inView = S.loop.a >= view.start && S.loop.b <= view.end;
    if (inView && length >= span * 0.25) return;
    const pad = Math.max(0.5, length * 0.6);
    setView(S.loop.a - pad, S.loop.b + pad);
  }

  function ensureVisible(a, b) {
    if (a >= view.start && b <= view.end) return;
    const span = view.end - view.start;
    if (b - a < span * 0.9) setView((a + b) / 2 - span / 2, (a + b) / 2 + span / 2);
    else zoomToLoop(a, b);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    for (const id of ["wave", "spectrum"]) {
      const c = $(id);
      const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
      if (w && h && (c.width !== w || c.height !== h)) {
        c.width = w;
        c.height = h;
      }
    }
    draw();
    drawSpectrum(false);
  }

  function draw() {
    const c = $("wave");
    const W = c.width, H = c.height;
    if (!W || !H || !video || !heard) return;
    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const { start, end } = view;
    const span = end - start;
    const px = (t) => ((t - start) / span) * W;
    const ruler = RULER * dpr;
    ctx.clearRect(0, 0, W, H);

    const { a, b, on } = S.loop;
    const valid = a != null && b != null;
    if (valid) {
      ctx.fillStyle = on ? "rgba(244,183,64,.12)" : "rgba(255,255,255,.05)";
      ctx.fillRect(px(a), ruler, px(b) - px(a), H - ruler);
    }

    // Levels heard so far, one column per device pixel.
    const mid = ruler + (H - ruler) / 2;
    const amp = (H - ruler) / 2 - 3 * dpr;
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(0, Math.round(mid), W, dpr);
    const xa = valid ? px(a) : -1, xb = valid ? px(b) : -1;
    for (const inside of [false, true]) {
      ctx.fillStyle = inside ? (on ? COLORS.accent : "#8fa3b5") : valid && on ? COLORS.waveDim : COLORS.wave;
      ctx.beginPath();
      for (let x = 0; x < W; x++) {
        if ((valid && x >= xa && x < xb) !== inside) continue;
        const i0 = Math.max(0, Math.floor((start + (x / W) * span) * BUCKETS));
        const i1 = Math.min(heard.length, Math.max(i0 + 1, Math.ceil((start + ((x + 1) / W) * span) * BUCKETS)));
        let peak = 0;
        for (let i = i0; i < i1; i++) if (heard[i] > peak) peak = heard[i];
        if (peak > 0) {
          const h = Math.max(dpr, Math.sqrt(Math.min(1, peak)) * amp);
          ctx.rect(x, mid - h, 1, 2 * h);
        }
      }
      ctx.fill();
    }

    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(0, 0, W, ruler);
    const step = tickStep(W / dpr / span);
    ctx.font = `${10.5 * dpr}px ui-monospace, Menlo, monospace`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = COLORS.muted;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
      const x = Math.round(px(t)) + 0.5;
      ctx.moveTo(x, ruler - 6 * dpr);
      ctx.lineTo(x, ruler);
      ctx.fillText(step < 1 ? fmt(t + 1e-6) : fmt(t + 1e-6, false), x + 4 * dpr, ruler / 2);
    }
    ctx.stroke();

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
      ctx.fillRect(x, ruler, ctx.measureText(label).width + 8 * dpr, 13 * dpr);
      ctx.fillStyle = "#0f1215";
      ctx.fillText(label, x + 4 * dpr, ruler + 7 * dpr);
    });

    const handle = (t, label, alignRight) => {
      const x = Math.round(px(t));
      ctx.fillStyle = COLORS.accent;
      ctx.fillRect(x - (alignRight ? dpr : 0), ruler, dpr * 1.5, H - ruler);
      const w = 15 * dpr;
      const bx = alignRight ? x - w : x;
      ctx.fillRect(bx, H - w, w, w);
      ctx.fillStyle = "#1b1403";
      ctx.font = `700 ${10.5 * dpr}px system-ui, sans-serif`;
      ctx.fillText(label, bx + 4 * dpr, H - w / 2 + dpr);
    };
    if (a != null) handle(a, "A", false);
    if (b != null) handle(b, "B", true);
  }

  function handleAt(x) {
    if (S.loop.b != null && Math.abs(x - timeToX(S.loop.b)) <= HANDLE_GRAB) return "b";
    if (S.loop.a != null && Math.abs(x - timeToX(S.loop.a)) <= HANDLE_GRAB) return "a";
    return null;
  }

  listen(waveBox, "pointerdown", (event) => {
    if (event.button !== 0 || !video) return;
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
  listen(waveBox, "pointermove", (event) => {
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
      S.loop.b = clamp(t, (S.loop.a ?? 0) + MIN_LOOP, duration);
    }
    const on = S.loop.on;
    syncLoop();
    S.loop.on = on;
  });
  const endDrag = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.mode === "pending") {
      seek(d.t0);
      return;
    }
    if (d.mode === "select") {
      if (!hasLoop()) {
        S.loop.a = S.loop.b = null;
        syncLoop();
        seek(d.t0);
        return;
      }
      S.loop.on = true;
    }
    syncLoop();
    enterLoop();
    focusLoop();
  };
  listen(waveBox, "pointerup", endDrag);
  listen(waveBox, "pointercancel", endDrag);
  listen(waveBox, "wheel", (event) => {
    if (!video) return;
    const span = view.end - view.start;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      event.preventDefault();
      const x = event.clientX - waveBox.getBoundingClientRect().left;
      zoom(Math.exp(clamp(event.deltaY, -120, 120) * 0.006), xToTime(x));
    } else if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      event.preventDefault();
      const dt = (event.deltaX / waveBox.clientWidth) * span;
      setView(view.start + dt, view.end + dt);
    }
  }, { passive: false });

  // ---- note display ----------------------------------------------------------------

  const levels = new Float32Array(NOTE_COUNT).fill(-140);
  let freqData = null;
  let timeData = null;
  const isBlack = (note) => [1, 3, 6, 8, 10].includes(note % 12);

  function drawSpectrum(update) {
    const c = $("spectrum");
    const W = c.width, H = c.height;
    if (!W || !H) return;
    if (update && audio.ok) {
      const analyser = audio.notes;
      if (!freqData) freqData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(freqData);
      const binHz = audio.ctx.sampleRate / analyser.fftSize;
      for (let i = 0; i < NOTE_COUNT; i++) {
        const f = 440 * 2 ** ((NOTE_LOW + i - 69) / 12);
        const lo = Math.max(1, Math.round((f * 2 ** (-0.4 / 12)) / binHz));
        const hi = Math.min(freqData.length - 1, Math.max(lo, Math.round((f * 2 ** (0.4 / 12)) / binHz)));
        let best = -140;
        for (let k = lo; k <= hi; k++) if (freqData[k] > best) best = freqData[k];
        levels[i] = best;
      }
    }
    const strong = strongestNotes(levels, -75);
    const strongSet = new Set(strong.map((s) => s.note));
    const chord = guessChord(levels, -70);
    $("chord").textContent = chord ? `≈ ${NAMES[G.names][chord.root]}${chord.suffix}` : "";

    const ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, W, H);
    const keysH = 30 * dpr, barsH = H - keysH - 15 * dpr, col = W / NOTE_COUNT;
    let top = -60;
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
        ctx.font = `700 ${10.5 * dpr}px system-ui, sans-serif`;
        ctx.fillText(NAMES[G.names][note % 12] + (Math.floor(note / 12) - 1), x + col / 2, H - keysH - h - 5 * dpr);
      }
      const black = isBlack(note);
      ctx.fillStyle = on ? COLORS.accent : black ? "#07090b" : "#d5dbe1";
      ctx.fillRect(x + 0.5 * dpr, H - keysH, col - dpr, black ? keysH * 0.62 : keysH);
      if (black) {
        ctx.fillStyle = "#2a333c";
        ctx.fillRect(x + 0.5 * dpr, H - keysH * 0.38, col - dpr, keysH * 0.38);
      }
      if (note % 12 === 0) {
        ctx.fillStyle = "#39434d";
        ctx.font = `600 ${8.5 * dpr}px system-ui, sans-serif`;
        ctx.fillText(`C${note / 12 - 1}`, x + col / 2, H - 3 * dpr);
      }
    }
  }

  let stopTone = null;
  const endTone = () => { stopTone?.(); stopTone = null; };
  listen($("spectrum"), "pointerdown", async (event) => {
    const rect = $("spectrum").getBoundingClientRect();
    const index = clamp(Math.floor(((event.clientX - rect.left) / rect.width) * NOTE_COUNT), 0, NOTE_COUNT - 1);
    $("spectrum").setPointerCapture(event.pointerId);
    let released = false;
    stopTone = () => { released = true; };
    await ensureAudio();
    if (released || !audio.ctx) return;
    const ctx = audio.ctx;
    const osc = new OscillatorNode(ctx, { type: "triangle", frequency: 440 * 2 ** ((NOTE_LOW + index - 69) / 12) });
    const gain = new GainNode(ctx, { gain: 0 });
    gain.gain.setTargetAtTime(0.2, ctx.currentTime, 0.008);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    stopTone = () => {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      osc.stop(ctx.currentTime + 0.4);
    };
  });
  listen($("spectrum"), "pointerup", endTone);
  listen($("spectrum"), "pointercancel", endTone);

  // ---- saved places ------------------------------------------------------------------

  function addItem(item) {
    S.items.push({ label: "", ...item });
    S.items.sort((x, y) => (x.type === "loop" ? x.a : x.t) - (y.type === "loop" ? y.a : y.t));
    renderItems();
    draw();
    saveSoon();
  }
  function saveLoop() {
    if (!hasLoop()) return;
    addItem({ type: "loop", a: S.loop.a, b: S.loop.b });
    hint("Loop gespeichert.", false, 1800);
  }
  function recall(item) {
    if (item.type === "loop") {
      S.loop = { a: item.a, b: item.b, on: true };
      syncLoop();
      seek(item.a);
      ensureVisible(item.a, item.b);
      focusLoop();
    } else {
      seek(item.t);
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
      label.placeholder = item.type === "loop" ? "Loop benennen …" : "Marker benennen …";
      label.addEventListener("input", () => { item.label = label.value; saveSoon(); });
      label.addEventListener("click", (event) => event.stopPropagation());
      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "×";
      del.title = "Löschen";
      del.addEventListener("click", (event) => {
        event.stopPropagation();
        S.items = S.items.filter((other) => other !== item);
        renderItems();
        draw();
        saveSoon();
      });
      li.append(num, when, label, del);
      li.addEventListener("click", () => recall(item));
      list.append(li);
    });
  }

  // ---- frame loop ---------------------------------------------------------------------

  let raf = 0;
  let lastClock = "";
  let lastBucket = -1;
  let lastSpec = 0;
  let lastDraw = 0;
  let lastBind = 0;
  let dirty = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - lastBind > 500) {
      lastBind = now;
      bind();
      if (G.open && video) {
        mount();
        applyPlayback();
      }
    }
    if (!video || host.hidden) return;
    enforceLoop();
    const t = video.currentTime;
    const text = fmt(t);
    if (text !== lastClock) $("time").textContent = lastClock = text;
    $("play").classList.toggle("on", !video.paused || Boolean(gapTimer));

    const playing = !video.paused && !video.seeking && !adShowing();
    if (audio.ok && playing && heard) {
      if (!timeData) timeData = new Float32Array(audio.level.fftSize);
      audio.level.getFloatTimeDomainData(timeData);
      let peak = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = Math.abs(timeData[i]);
        if (v > peak) peak = v;
      }
      const bucket = clamp(Math.floor(t * BUCKETS), 0, heard.length - 1);
      const from = lastBucket >= 0 && bucket > lastBucket && bucket - lastBucket < 25 ? lastBucket + 1 : bucket;
      for (let i = from; i <= bucket; i++) heard[i] = Math.max(peak, 0.004);
      lastBucket = bucket;
      dirty = true;
    } else {
      lastBucket = -1;
    }

    const span = view.end - view.start;
    if (playing && !drag && (t > view.end - span * 0.02 || t < view.start) && span < duration) {
      setView(t - span * 0.08, t - span * 0.08 + span);
    } else if (dirty && now - lastDraw > 120) {
      lastDraw = now;
      dirty = false;
      draw();
    }
    const x = timeToX(t);
    const head = $("playhead");
    head.style.visibility = x < 0 || x > waveBox.clientWidth ? "hidden" : "visible";
    head.style.transform = `translateX(${x}px)`;

    if (now - lastSpec > 70) {
      lastSpec = now;
      if (playing || !audio.ok) drawSpectrum(playing);
    }
  }

  // ---- wiring ---------------------------------------------------------------------------

  // Any click while the panel is open is a user gesture that may start audio processing.
  listen(document, "pointerdown", () => { if (G.open && !host.hidden) ensureAudio(); }, { capture: true });
  $("play").onclick = togglePlay;
  $("restart").onclick = restart;
  $("loop-toggle").onclick = toggleLoop;
  $("set-a").onclick = () => setA(video.currentTime);
  $("set-b").onclick = () => setB(video.currentTime);
  $("loop-prev").onclick = () => moveLoop(-1);
  $("loop-next").onclick = () => moveLoop(1);
  $("loop-half").onclick = () => scaleLoop(0.5);
  $("loop-double").onclick = () => scaleLoop(2);
  $("loop-save").onclick = saveLoop;
  $("loop-clear").onclick = () => { S.loop = { a: null, b: null, on: false }; syncLoop(); };
  for (const [id, edge] of [["loop-a", "a"], ["loop-b", "b"]]) {
    listen($(id), "change", (event) => {
      const value = parseTime(event.target.value);
      const other = edge === "a" ? S.loop.b : S.loop.a;
      const ok = value != null && value <= duration && (other == null || (edge === "a" ? other - value : value - other) >= MIN_LOOP);
      if (!ok) {
        event.target.classList.add("bad");
        return;
      }
      S.loop[edge] = value;
      if (hasLoop()) S.loop.on = true;
      event.target.blur();
      syncLoop();
      enterLoop();
      focusLoop();
    });
  }
  $("zoom-in").onclick = () => zoom(0.5);
  $("zoom-out").onclick = () => zoom(2);
  $("zoom-loop").onclick = () => zoomToLoop();
  $("zoom-fit").onclick = () => setView(0, duration);
  listen($("speed"), "input", (event) => setSpeed(Number(event.target.value)));
  listen($("speed-chips"), "click", (event) => { if (event.target.dataset.v) setSpeed(Number(event.target.dataset.v)); });
  listen($("gap"), "input", (event) => { S.gap = Number(event.target.value); refreshControls(); saveSoon(); });
  $("pitch-down").onclick = () => setPitch(S.semis - 1, S.cents);
  $("pitch-up").onclick = () => setPitch(S.semis + 1, S.cents);
  $("pitch-oct-down").onclick = () => setPitch(S.semis - 12, S.cents);
  $("pitch-oct-up").onclick = () => setPitch(S.semis + 12, S.cents);
  $("pitch-reset").onclick = () => setPitch(0, 0);
  $("pitch-out").onclick = () => setPitch(0, 0);
  $("speed-out").onclick = () => setSpeed(100);
  listen($("cents"), "input", (event) => setPitch(S.semis, Number(event.target.value)));
  listen($("channel"), "change", (event) => { S.chan = Number(event.target.value); applyPlayback(); saveSoon(); });
  listen($("focus-chips"), "click", (event) => {
    const { low, high } = event.target.dataset;
    if (!low) return;
    const toSlider = (hz) => Math.round((1000 * Math.log(hz / 20)) / Math.log(1000));
    setBand(toSlider(Number(low)), toSlider(Number(high)));
  });
  listen($("band-low"), "input", (event) => setBand(Number(event.target.value), S.high));
  listen($("band-high"), "input", (event) => setBand(S.low, Number(event.target.value)));
  $("names").onclick = () => { G.names = G.names === "de" ? "intl" : "de"; refreshControls(); drawSpectrum(false); saveSoon(); };
  $("add-marker").onclick = () => addItem({ type: "marker", t: video.currentTime });
  $("keys").onclick = () => { G.keys = !G.keys; updateVisibility(); saveSoon(); };
  $("help-btn").onclick = () => { $("help").hidden = !$("help").hidden; if (G.collapsed) { G.collapsed = false; updateVisibility(); } };
  $("collapse").onclick = () => { G.collapsed = !G.collapsed; updateVisibility(); resize(); saveSoon(); };
  $("close").onclick = () => setOpen(false);
  $("place").onclick = () => { G.place = G.place === "side" ? "below" : "side"; mount(); resize(); saveSoon(); };
  for (const panel of root.querySelectorAll("[data-sec]")) {
    panel.querySelector("h2").onclick = () => {
      G.folded[panel.dataset.sec] = !G.folded[panel.dataset.sec];
      updateVisibility();
      resize();
      saveSoon();
    };
  }
  $("files").onclick = () => { try { chrome.runtime.sendMessage({ type: "open-app" }); } catch { /* extension reloaded */ } };

  function setOpen(open) {
    G.open = open;
    if (!open) {
      clearTimeout(gapTimer);
      gapTimer = 0;
    }
    updateVisibility();
    if (open) {
      resize();
      if (!host.classList.contains("side")) host.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    saveSoon();
  }

  // Keyboard: while the panel is open its shortcuts take precedence over
  // YouTube's single-key shortcuts (toggle with the "Tasten" button).
  const swallowed = new Set();
  listen(window, "keydown", (event) => {
    if (!G.open || !G.keys || !video || host.hidden || event.metaKey || event.ctrlKey) return;
    const target = event.composedPath()[0];
    const typing = target instanceof HTMLElement && (target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable || (target.tagName === "INPUT" && target.type !== "range"));
    if (typing) {
      if (event.key === "Escape" && root.contains(target)) target.blur();
      if (root.contains(target)) event.stopPropagation(); // keep YouTube's shortcuts out of our text fields
      return;
    }
    const coarse = event.shiftKey;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const t = video.currentTime;
    switch (key) {
      case " ": togglePlay(); break;
      case "Enter": if (root.contains(target) && target.tagName === "BUTTON") return; restart(); break;
      case "ArrowLeft": seek(t - (event.altKey ? 0.1 : coarse ? 5 : 1)); break;
      case "ArrowRight": seek(t + (event.altKey ? 0.1 : coarse ? 5 : 1)); break;
      case "ArrowUp": setSpeed(S.speed + 5); break;
      case "ArrowDown": setSpeed(S.speed - 5); break;
      case "a": setA(t); break;
      case "b": setB(t); break;
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
      case "m": addItem({ type: "marker", t }); break;
      case "s": saveLoop(); break;
      case "z": zoomToLoop(); break;
      case "f": setView(0, duration); break;
      default:
        if (/^[1-9]$/.test(key) && S.items[key - 1]) { recall(S.items[key - 1]); break; }
        return;
    }
    ensureAudio();
    swallowed.add(event.code);
    event.preventDefault();
    event.stopImmediatePropagation();
    if (root.contains(target) && target.tagName === "BUTTON") target.blur();
  }, { capture: true });
  for (const type of ["keyup", "keypress"]) {
    listen(window, type, (event) => {
      if (!swallowed.has(event.code)) return;
      if (type === "keyup") swallowed.delete(event.code);
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true });
  }

  const onMessage = (message) => {
    if (message?.type === "toggle-panel") {
      bind();
      if (!video) {
        // Still show something so the click is not silently ignored.
        mount();
        $("p").classList.add("empty");
        host.hidden = !host.hidden;
        statusHint();
        return;
      }
      setOpen(!G.open || host.hidden);
    }
  };
  chrome.runtime.onMessage.addListener(onMessage);
  listen(document, "yt-navigate-finish", () => { lastBind = 0; });
  const observer = new ResizeObserver(resize);
  observer.observe(waveBox);
  observer.observe($("spectrum"));

  function destroy() {
    abort.abort();
    cancelAnimationFrame(raf);
    observer.disconnect();
    clearTimeout(gapTimer);
    clearTimeout(saveTimer);
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch { /* context gone */ }
    video?.removeEventListener("timeupdate", enforceLoop);
    video?.removeEventListener("ended", onEnded);
    G.open = false;
    applyPlayback();
    if (audio.ok) {
      // Leave a plain, unprocessed connection behind for the next copy.
      try {
        audio.source.disconnect();
        audio.source.connect(audio.ctx.destination);
      } catch { /* nothing more to do */ }
    }
    host.remove();
  }
  window.__ytlInstance = { destroy };

  load("ytl:global").then((data) => {
    Object.assign(G, data["ytl:global"]);
    bind();
    updateVisibility();
    raf = requestAnimationFrame(frame);
  });
})();
