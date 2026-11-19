(() => {
  "use strict";

  // Das Bedienfeld im Video ist optional und wird nie automatisch eingeblendet.
  const state = { start: null, end: null, enabled: false, panel: null, panelVisible: false, video: null };
  const EPSILON = 0.06;

  const getVideo = () => document.querySelector("video.html5-main-video");
  const clamp = (value, max) => Math.max(0, Math.min(value, Number.isFinite(max) ? max : value));
  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds)) return "--:--.--";
    const minutes = Math.floor(seconds / 60);
    const wholeSeconds = Math.floor(seconds % 60);
    const centiseconds = Math.floor((seconds % 1) * 100);
    return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
  };
  const parseTime = (value) => {
    const parts = String(value).trim().replace(",", ".").split(":");
    if (!parts.length || parts.some((part) => part === "" || !Number.isFinite(Number(part)))) return null;
    const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0);
    return seconds >= 0 ? seconds : null;
  };

  function validRange() {
    return Number.isFinite(state.start) && Number.isFinite(state.end) && state.end > state.start + EPSILON;
  }

  function status() {
    return {
      start: state.start,
      end: state.end,
      enabled: state.enabled,
      valid: validRange(),
      panelVisible: state.panelVisible,
      hasVideo: Boolean(state.video),
      currentTime: state.video?.currentTime ?? null
    };
  }

  function render() {
    if (!state.panel) return;
    const startInput = state.panel.querySelector("[data-start]");
    const endInput = state.panel.querySelector("[data-end]");
    if (document.activeElement !== startInput) startInput.value = formatTime(state.start);
    if (document.activeElement !== endInput) endInput.value = formatTime(state.end);
    const toggle = state.panel.querySelector("[data-toggle]");
    // Der Text beschreibt bewusst die nächste Aktion, nicht den aktuellen Status.
    toggle.textContent = state.enabled ? "Loop ausschalten" : "Loop einschalten";
    toggle.classList.toggle("ytl-active", state.enabled);
    state.panel.classList.toggle("ytl-invalid", state.enabled && !validRange());
  }

  function setStart(value = state.video?.currentTime) {
    if (!Number.isFinite(value)) return status();
    state.start = clamp(value, state.video?.duration);
    if (Number.isFinite(state.end) && state.end <= state.start) state.end = null;
    render();
    return status();
  }

  function setEnd(value = state.video?.currentTime) {
    if (!Number.isFinite(value)) return status();
    state.end = clamp(value, state.video?.duration);
    if (Number.isFinite(state.start) && state.end <= state.start) state.start = null;
    render();
    return status();
  }

  function toggle(force) {
    state.enabled = typeof force === "boolean" ? force : !state.enabled;
    render();
    return status();
  }

  function clear() {
    state.start = null;
    state.end = null;
    state.enabled = false;
    render();
    return status();
  }

  function setPanelVisible(visible) {
    state.panelVisible = visible;
    state.panel?.classList.toggle("ytl-hidden", !visible);
    return status();
  }

  function enforceLoop() {
    const video = state.video;
    if (!video || !state.enabled || !validRange() || video.seeking) return;
    if (video.currentTime >= state.end - EPSILON) {
      video.currentTime = state.start;
      video.play().catch(() => {});
    }
  }

  function seekBy(amount) {
    if (!state.video) return;
    state.video.currentTime = clamp(state.video.currentTime + amount, state.video.duration);
  }

  function mountPanel() {
    if (state.panel || !document.body) return;
    const panel = document.createElement("section");
    panel.id = "ytl-panel";
    panel.innerHTML = `
      <div class="ytl-heading"><span>Transkript-Loop</span><button data-close aria-label="Bedienfeld ausblenden" title="Bedienfeld ausblenden">×</button></div>
      <div class="ytl-times"><label>A / Start<input data-start inputmode="decimal" aria-label="Startzeit"></label><label>B / Ende<input data-end inputmode="decimal" aria-label="Endzeit"></label></div>
      <div class="ytl-actions">
        <button data-set-start>A setzen</button><button data-set-end>B setzen</button>
        <button data-toggle>Loop einschalten</button><button data-clear>Leeren</button>
      </div>
      <p>Alt+[ = A · Alt+] = B · Alt+L = Loop · Alt+J/K = ±0,25 s</p>`;
    panel.querySelector("[data-set-start]").addEventListener("click", () => setStart());
    panel.querySelector("[data-set-end]").addEventListener("click", () => setEnd());
    panel.querySelector("[data-toggle]").addEventListener("click", () => toggle());
    panel.querySelector("[data-clear]").addEventListener("click", clear);
    panel.querySelector("[data-start]").addEventListener("change", (event) => { const time = parseTime(event.target.value); if (time !== null) setStart(time); else render(); });
    panel.querySelector("[data-end]").addEventListener("change", (event) => { const time = parseTime(event.target.value); if (time !== null) setEnd(time); else render(); });
    panel.querySelector("[data-close]").addEventListener("click", () => setPanelVisible(false));
    document.body.append(panel);
    state.panel = panel;
    panel.classList.toggle("ytl-hidden", !state.panelVisible);
    render();
  }

  function connectVideo() {
    const video = getVideo();
    if (!video || video === state.video) return;
    state.video?.removeEventListener("timeupdate", enforceLoop);
    state.video = video;
    video.addEventListener("timeupdate", enforceLoop);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    connectVideo();
    switch (message?.type) {
      case "get-status": sendResponse(status()); break;
      case "set-start": sendResponse(setStart(message.value)); break;
      case "set-end": sendResponse(setEnd(message.value)); break;
      case "toggle": sendResponse(toggle(message.enabled)); break;
      case "clear": sendResponse(clear()); break;
      case "set-panel-visibility": mountPanel(); sendResponse(setPanelVisible(Boolean(message.visible))); break;
      default: sendResponse({ error: "Unbekannte Aktion" });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    const handlers = { "[": () => setStart(), "]": () => setEnd(), l: () => toggle(), j: () => seekBy(-0.25), k: () => seekBy(0.25) };
    const handler = handlers[event.key.toLowerCase()];
    if (!handler) return;
    event.preventDefault();
    handler();
  }, true);

  mountPanel();
  connectVideo();
  new MutationObserver(connectVideo).observe(document.documentElement, { childList: true, subtree: true });
})();
