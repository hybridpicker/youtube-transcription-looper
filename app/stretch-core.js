// Time-stretch / pitch-shift playback core.
//
// A phase vocoder with identity phase locking (one rotation per spectral peak
// region, shared across channels so the stereo image stays intact) changes the
// tempo; a cubic resampler behind it changes the pitch. At 100 % speed and
// original pitch the samples are passed through untouched. Loop boundaries are
// sample-accurate in both paths and get a short fade instead of a click.
//
// Pure DSP with no Web Audio dependencies, so it can be tested offline.
import { PhaseVocoder, hermite } from "./vocoder.js";

const FADE = 128; // samples
const HOP_RING = 64;
const PREROLL_HOPS = 3;

export const CHANNEL_MODES = ["stereo", "left", "right", "mid", "side"];

export class Stretcher {
  constructor(channels, sampleRate) {
    this.src = channels;
    this.nch = channels.length;
    this.len = channels[0].length;

    this.rate = 1;
    this.pitch = 1;
    this.loopOn = false;
    this.loopA = 0;
    this.loopB = this.len;
    this.gap = 0; // silence between loop passes, in samples
    this.chanMode = 0;

    this.playing = false;
    this.ended = false;
    this.gain = 0;
    this.silence = 0;

    // Direct path
    this.direct = true;
    this.pos = 0;
    this.stop = this.len;
    this.stopIsLoop = false;

    // Vocoder path
    const N = (this.N = sampleRate > 50000 ? 8192 : 4096);
    const Hs = (this.Hs = N / 4);
    this.voc = new PhaseVocoder(N, this.nch);
    this.ringSize = Hs * 16;
    this.ringMask = this.ringSize - 1;
    this.ring = [];
    for (let c = 0; c < this.nch; c++) this.ring.push(new Float32Array(this.ringSize));
    this.hopSrc = new Float64Array(HOP_RING);
    this.hopHa = new Float64Array(HOP_RING);
    this.hops = 0;
    this.wAbs = 0;
    this.rp = 0;
    this.rpEnd = Infinity;
    this.genStopped = false;
    this.discard = 0;
    this.aF = 0;
    this.aPrev = 0;
    this.headSrc = 0;
    this.vpos = 0;
  }

  // ---- control -----------------------------------------------------------

  setPlaying(on) {
    if (on && this.ended) {
      this.ended = false;
      this.seek(this.loopOn ? this.loopA : 0);
    }
    this.playing = on;
  }

  setParams(rate, pitch) {
    const direct = rate === 1 && pitch === 1;
    if (direct !== this.direct) {
      const p = this.position();
      this.rate = rate;
      this.pitch = pitch;
      this.direct = direct;
      this.gain = 0;
      this._jump(p);
    } else {
      this.rate = rate;
      this.pitch = pitch;
    }
  }

  setLoop(on, a, b) {
    a = Math.max(0, Math.min(Math.round(a), this.len - 1));
    b = Math.max(a + 1, Math.min(Math.round(b), this.len));
    this.loopOn = on;
    this.loopA = a;
    this.loopB = b;
    const p = this.position();
    if (on && (p < a || p >= b)) {
      this.seek(a);
    } else if (this.direct) {
      this._computeStop();
    } else if (this.genStopped || (on && this.headSrc > b)) {
      // Audio past the new boundary is already rendered; start over from here.
      this.gain = 0;
      this._jump(p);
    }
  }

  seek(p) {
    p = Math.max(0, Math.min(Math.round(p), this.len));
    this.ended = false;
    this.silence = 0;
    this.gain = 0;
    this._jump(p);
  }

  position() {
    if (this.direct) return this.pos;
    if (this.hops === 0) return this.vpos;
    const h = Math.min(Math.floor(this.rp / this.Hs), this.hops - 1);
    const p = this.hopSrc[h % HOP_RING] + (this.rp / this.Hs - h) * this.hopHa[h % HOP_RING];
    return Math.max(0, Math.min(p, this.len));
  }

  _computeStop() {
    this.stopIsLoop = this.loopOn && this.pos < this.loopB;
    this.stop = this.stopIsLoop ? this.loopB : this.len;
  }

  _jump(p) {
    if (this.direct) {
      this.pos = p;
      this._computeStop();
      return;
    }
    this.vpos = p;
    this.voc.clear();
    this.hops = 0;
    this.wAbs = 0;
    this.rp = 0;
    this.rpEnd = Infinity;
    this.genStopped = false;
    this.discard = PREROLL_HOPS;
    const Ha = (this.Hs * this.rate) / this.pitch;
    // Chosen so the first hop that is kept starts exactly at p.
    this.aF = p - this.N / 2 + 2 * Ha - PREROLL_HOPS * Ha;
    this.aPrev = Math.round(this.aF);
    this.headSrc = p;
  }

  _reachedStop() {
    if (this.stopIsLoop && this.loopOn) {
      this.silence = this.gap;
      this.gain = 0;
      this._jump(this.loopA);
    } else {
      this.ended = true;
      this.playing = false;
      this.gain = 0;
      if (this.direct) this.pos = this.len;
      else {
        this.vpos = this.len;
        this.hops = 0;
      }
    }
  }

  // ---- vocoder -----------------------------------------------------------

  _genFrame() {
    const N = this.N, Hs = this.Hs, len = this.len, nch = this.nch, voc = this.voc;
    const HaF = (Hs * this.rate) / this.pitch;
    const a = Math.round(this.aF);
    const from = Math.max(0, -a), to = Math.min(N, len - a);
    for (let c = 0; c < nch; c++) {
      const re = voc.re[c], s = this.src[c];
      re.fill(0);
      for (let n = from; n < to; n++) re[n] = s[a + n];
    }
    voc.frame(a - this.aPrev);

    if (this.discard > 0) {
      this.discard--;
    } else {
      const base = this.wAbs & this.ringMask;
      for (let c = 0; c < nch; c++) {
        const ring = this.ring[c], ola = voc.ola[c];
        for (let n = 0; n < Hs; n++) ring[(base + n) & this.ringMask] = ola[n];
      }
      const hopStart = a + N / 2 - 2 * HaF;
      const h = this.hops % HOP_RING;
      this.hopSrc[h] = hopStart;
      this.hopHa[h] = HaF;
      this.headSrc = hopStart + HaF;
      const isLoop = this.loopOn && hopStart < this.loopB;
      const stop = isLoop ? this.loopB : len;
      if (this.headSrc >= stop) {
        this.rpEnd = this.wAbs + (Math.max(0, stop - hopStart) / HaF) * Hs;
        this.genStopped = true;
        this.stopIsLoop = isLoop;
      }
      this.hops++;
      this.wAbs += Hs;
    }
    voc.advance();
    this.aF += HaF;
    this.aPrev = a;
  }

  // ---- render ------------------------------------------------------------

  process(outL, outR, n) {
    const stereo = this.nch > 1;
    const s0 = this.src[0], s1 = stereo ? this.src[1] : this.src[0];
    const r0 = this.ring[0], r1 = stereo ? this.ring[1] : this.ring[0];
    const mask = this.ringMask, mode = this.chanMode, step = 1 / FADE;
    for (let i = 0; i < n; i++) {
      let l = 0, r = 0;
      const audible = !this.ended && (this.playing || this.gain > 0);
      if (!audible) {
        outL[i] = 0; outR[i] = 0;
        continue;
      }
      if (this.silence > 0) {
        this.silence--;
        if (!this.playing) this.silence = 0;
        outL[i] = 0; outR[i] = 0;
        continue;
      }
      let fo = 1;
      if (this.direct) {
        if (this.pos >= this.stop) {
          this._reachedStop();
          outL[i] = 0; outR[i] = 0;
          continue;
        }
        l = s0[this.pos]; r = s1[this.pos];
        const edge = this.stop - this.pos;
        if (edge < FADE) fo = edge * step;
        this.pos++;
      } else {
        if (this.rp >= this.rpEnd) {
          this._reachedStop();
          outL[i] = 0; outR[i] = 0;
          continue;
        }
        const ip = Math.floor(this.rp);
        // Render far enough ahead that the fade-out before a stop starts on time.
        const ahead = ip + 3 + FADE * this.pitch;
        while (!this.genStopped && this.wAbs < ahead) this._genFrame();
        const t = this.rp - ip;
        if (t === 0) {
          l = r0[ip & mask]; r = r1[ip & mask];
        } else {
          const im1 = ip > 0 ? ip - 1 : 0;
          l = hermite(r0[im1 & mask], r0[ip & mask], r0[(ip + 1) & mask], r0[(ip + 2) & mask], t);
          r = stereo ? hermite(r1[im1 & mask], r1[ip & mask], r1[(ip + 1) & mask], r1[(ip + 2) & mask], t) : l;
        }
        const edge = (this.rpEnd - this.rp) / this.pitch;
        if (edge < FADE) fo = Math.max(0, edge * step);
        this.rp += this.pitch;
      }
      if (this.playing) { if (this.gain < 1) this.gain = Math.min(1, this.gain + step); }
      else this.gain = Math.max(0, this.gain - step);
      const g = this.gain * fo;
      if (mode === 1) r = l;
      else if (mode === 2) l = r;
      else if (mode === 3) l = r = 0.5 * (l + r);
      else if (mode === 4) l = r = 0.5 * (l - r);
      outL[i] = l * g;
      outR[i] = r * g;
    }
  }
}
