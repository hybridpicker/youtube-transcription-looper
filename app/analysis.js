// Offline analysis helpers for the UI: waveform peaks, the note spectrum shown
// above the keyboard and WAV export.
import { FFT } from "./fft.js";

// Note helpers live in shared/common.js (loaded as a classic script).
export const { NOTE_LOW, NOTE_HIGH, strongestNotes, guessChord } = globalThis.TL;
const SPECTRUM_SIZE = 16384;

let fft = null;
let fftRe = null;
let fftIm = null;
let fftWin = null;

// Min/max pyramid over a mono mix: level 0 covers 64 samples per entry,
// level 1 covers 1024.
export function buildPeaks(buffer) {
  const channels = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c));
  const len = buffer.length;
  const n0 = Math.ceil(len / 64);
  const min0 = new Float32Array(n0), max0 = new Float32Array(n0);
  const a = channels[0], b = channels[1] || channels[0];
  for (let i = 0; i < n0; i++) {
    let lo = 1, hi = -1;
    const end = Math.min(len, (i + 1) * 64);
    for (let s = i * 64; s < end; s++) {
      const v = 0.5 * (a[s] + b[s]);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min0[i] = lo;
    max0[i] = hi;
  }
  const n1 = Math.ceil(n0 / 16);
  const min1 = new Float32Array(n1), max1 = new Float32Array(n1);
  for (let i = 0; i < n1; i++) {
    let lo = 1, hi = -1;
    const end = Math.min(n0, (i + 1) * 16);
    for (let s = i * 16; s < end; s++) {
      if (min0[s] < lo) lo = min0[s];
      if (max0[s] > hi) hi = max0[s];
    }
    min1[i] = lo;
    max1[i] = hi;
  }
  return { mono: [a, b], levels: [{ block: 64, min: min0, max: max0 }, { block: 1024, min: min1, max: max1 }] };
}

// Level in dB per semitone (NOTE_LOW..NOTE_HIGH) around `time`. `shift` is the
// playback transposition in semitones, so the keys show what is being heard.
export function noteSpectrum(buffer, time, shift, channelMode, out) {
  const N = SPECTRUM_SIZE;
  if (!fft) {
    fft = new FFT(N);
    fftRe = new Float64Array(N);
    fftIm = new Float64Array(N);
    fftWin = new Float64Array(N);
    for (let n = 0; n < N; n++) fftWin[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N);
  }
  const sr = buffer.sampleRate;
  const a = buffer.getChannelData(0);
  const b = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : a;
  const wa = channelMode === 2 ? 0 : channelMode === 0 || channelMode >= 3 ? 0.5 : 1;
  const wb = channelMode === 1 ? 0 : channelMode === 4 ? -0.5 : channelMode === 2 ? 1 : 0.5;
  const start = Math.round(time * sr) - N / 2;
  for (let n = 0; n < N; n++) {
    const i = start + n;
    fftRe[n] = i >= 0 && i < a.length ? (wa * a[i] + wb * b[i]) * fftWin[n] : 0;
    fftIm[n] = 0;
  }
  fft.transform(fftRe, fftIm);
  const binHz = sr / N;
  const count = NOTE_HIGH - NOTE_LOW + 1;
  for (let i = 0; i < count; i++) {
    const f = 440 * 2 ** ((NOTE_LOW + i - 69 - shift) / 12);
    const lo = Math.max(1, Math.round((f * 2 ** (-0.4 / 12)) / binHz));
    const hi = Math.min(N / 2 - 1, Math.max(lo, Math.round((f * 2 ** (0.4 / 12)) / binHz)));
    let best = 0;
    for (let k = lo; k <= hi; k++) {
      const p = fftRe[k] * fftRe[k] + fftIm[k] * fftIm[k];
      if (p > best) best = p;
    }
    // Normalized so a full-scale sine reads 0 dB.
    out[i] = 10 * Math.log10(best / ((N / 4) * (N / 4)) + 1e-12);
  }
  return out;
}

export function encodeWav(buffer, startSec, endSec) {
  const sr = buffer.sampleRate;
  const from = Math.max(0, Math.round(startSec * sr));
  const to = Math.min(buffer.length, Math.round(endSec * sr));
  const nch = Math.min(2, buffer.numberOfChannels);
  const frames = Math.max(0, to - from);
  const bytes = new ArrayBuffer(44 + frames * nch * 2);
  const view = new DataView(bytes);
  const text = (offset, s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, "RIFF");
  view.setUint32(4, 36 + frames * nch * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, nch, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * nch * 2, true);
  view.setUint16(32, nch * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * nch * 2, true);
  const data = [];
  for (let c = 0; c < nch; c++) data.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = from; i < to; i++) {
    for (let c = 0; c < nch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: "audio/wav" });
}
