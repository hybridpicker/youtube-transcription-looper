// Helpers shared by the file workstation (ES modules) and the YouTube content
// script (classic script), hence a plain global instead of exports.
(() => {
  "use strict";
  const NOTE_LOW = 28; // E1
  const NOTE_HIGH = 96; // C7
  const NAMES = {
    de: ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "B", "H"],
    intl: ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
  };
  const CHORDS = [
    ["", [0, 4, 7]], ["m", [0, 3, 7]], ["7", [0, 4, 7, 10]], ["maj7", [0, 4, 7, 11]],
    ["m7", [0, 3, 7, 10]], ["dim", [0, 3, 6]], ["sus4", [0, 5, 7]], ["m7b5", [0, 3, 6, 10]]
  ];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function fmt(t, fine = true) {
    if (t == null || !Number.isFinite(t)) return "";
    t = Math.max(0, t);
    const whole = Math.floor(t + (fine ? 0.005 : 0));
    const m = Math.floor(whole / 60);
    const s = String(whole % 60).padStart(2, "0");
    if (!fine) return `${m}:${s}`;
    const cs = String(Math.floor((t + 0.005 - whole) * 100)).padStart(2, "0");
    return `${m}:${s}.${cs}`;
  }

  function parseTime(value) {
    const parts = String(value).trim().replace(",", ".").split(":");
    if (parts.some((p) => p === "" || !Number.isFinite(Number(p)))) return null;
    const seconds = parts.reduce((total, p) => total * 60 + Number(p), 0);
    return seconds >= 0 ? seconds : null;
  }

  // Ruler step in seconds so that labels are at least 80 px apart.
  function tickStep(pxPerSec) {
    const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
    return steps.find((s) => s * pxPerSec >= 80) || 3600;
  }

  // Local maxima of a per-semitone dB profile (NOTE_LOW..NOTE_HIGH), strongest first.
  function strongestNotes(levels, floorDb = -62, maxCount = 6, rangeDb = 24) {
    let top = -Infinity;
    for (const v of levels) if (v > top) top = v;
    if (top < floorDb) return [];
    const found = [];
    for (let i = 0; i < levels.length; i++) {
      const v = levels[i];
      const left = i > 0 ? levels[i - 1] : -Infinity;
      const right = i < levels.length - 1 ? levels[i + 1] : -Infinity;
      if (v >= left && v > right && v > top - rangeDb) found.push({ note: NOTE_LOW + i, db: v });
    }
    return found.sort((x, y) => y.db - x.db).slice(0, maxCount);
  }

  // Template match on the pitch-class profile. A hint, not a transcription.
  function guessChord(levels, floorDb = -55) {
    const chroma = new Float64Array(12);
    let top = -Infinity;
    for (const v of levels) if (v > top) top = v;
    if (top < floorDb) return null;
    for (let i = 0; i < levels.length; i++) {
      const note = NOTE_LOW + i;
      if (note < 36 || note > 88 || levels[i] < top - 30) continue;
      chroma[note % 12] += 10 ** (levels[i] / 20);
    }
    let norm = 0;
    for (const v of chroma) norm += v * v;
    if (norm === 0) return null;
    let best = null;
    for (let root = 0; root < 12; root++) {
      for (const [suffix, tones] of CHORDS) {
        let dot = 0;
        for (const t of tones) dot += chroma[(root + t) % 12];
        const score = dot / Math.sqrt(norm * tones.length);
        if (!best || score > best.score + 1e-9) best = { root, suffix, score };
      }
    }
    return best && best.score > 0.8 ? best : null;
  }

  globalThis.TL = { NOTE_LOW, NOTE_HIGH, NAMES, clamp, fmt, parseTime, tickStep, strongestNotes, guessChord };
})();
