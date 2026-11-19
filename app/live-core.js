// Real-time pitch shifter for a running audio stream (the YouTube player).
//
// The video element is slowed down with pitch preservation switched off, which
// is plain, artifact-free resampling. This shifter then moves the pitch back
// (times any transposition): the phase vocoder stretches the stream by `ratio`
// and a cubic resampler reads it `ratio` times faster, so input and output run
// at the same rate. The price is a fixed delay of about one window.
import { PhaseVocoder, hermite } from "./vocoder.js";

const SLACK = 192; // extra input samples kept in hand against underruns

export class LiveShifter {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.ratio = 1;
    this.chanMode = 0;
    this.N = 0;
    this.voc = null;
  }

  // `ratio` is the pitch factor to apply. `slow` is the playback rate of the
  // source: slowed material is compressed in frequency, so the window grows
  // with it to keep the same resolution in terms of the original audio.
  configure(ratio, slow = 1) {
    let N = 4096;
    while (N * slow < 3000 && N < 16384) N *= 2;
    if (this.sampleRate > 50000) N *= 2;
    this.ratio = ratio;
    if (N !== this.N || !this.voc) this._build(N);
  }

  get active() { return Math.abs(this.ratio - 1) > 1e-4; }
  get latency() { return this.active ? this.N + SLACK : 0; }

  _build(N) {
    this.N = N;
    this.Hs = N / 4;
    this.voc = new PhaseVocoder(N, 2);
    this.inMask = N * 2 - 1;
    this.inRing = [new Float32Array(N * 2), new Float32Array(N * 2)];
    this.outMask = this.Hs * 16 - 1;
    this.outRing = [new Float32Array(this.Hs * 16), new Float32Array(this.Hs * 16)];
    this._restart();
  }

  _restart() {
    this.voc.clear();
    this.inW = 0;
    this.aF = 0;
    this.aPrev = 0;
    this.wAbs = 0;
    this.rp = 0;
    this.primed = false;
    this.wasActive = false;
  }

  _genFrame() {
    const N = this.N, Hs = this.Hs, voc = this.voc;
    const a = Math.round(this.aF);
    for (let c = 0; c < 2; c++) {
      const re = voc.re[c], ring = this.inRing[c];
      for (let n = 0; n < N; n++) re[n] = ring[(a + n) & this.inMask];
    }
    voc.frame(a - this.aPrev);
    const base = this.wAbs & this.outMask;
    for (let c = 0; c < 2; c++) {
      const ring = this.outRing[c], ola = voc.ola[c];
      for (let n = 0; n < Hs; n++) ring[(base + n) & this.outMask] = ola[n];
    }
    voc.advance();
    this.wAbs += Hs;
    this.aPrev = a;
    this.aF += Hs / this.ratio;
  }

  process(inL, inR, outL, outR, n) {
    const mode = this.chanMode;
    if (!this.active || !this.voc) {
      this.wasActive = false;
      for (let i = 0; i < n; i++) mix(inL[i], inR[i], mode, outL, outR, i);
      return;
    }
    if (!this.wasActive) {
      this._restart();
      this.wasActive = true;
    }
    const i0 = this.inRing[0], i1 = this.inRing[1], im = this.inMask;
    for (let i = 0; i < n; i++) {
      i0[(this.inW + i) & im] = inL[i];
      i1[(this.inW + i) & im] = inR[i];
    }
    this.inW += n;
    if (!this.primed) {
      if (this.inW < this.N + SLACK) {
        outL.fill(0, 0, n);
        outR.fill(0, 0, n);
        return;
      }
      this.primed = true;
    }
    const o0 = this.outRing[0], o1 = this.outRing[1], om = this.outMask, N = this.N, ratio = this.ratio;
    for (let i = 0; i < n; i++) {
      const ip = Math.floor(this.rp);
      while (this.wAbs < ip + 3 && Math.round(this.aF) + N <= this.inW) this._genFrame();
      if (this.wAbs < ip + 3) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }
      const t = this.rp - ip;
      const m1 = ip > 0 ? ip - 1 : 0;
      const l = hermite(o0[m1 & om], o0[ip & om], o0[(ip + 1) & om], o0[(ip + 2) & om], t);
      const r = hermite(o1[m1 & om], o1[ip & om], o1[(ip + 1) & om], o1[(ip + 2) & om], t);
      mix(l, r, mode, outL, outR, i);
      this.rp += ratio;
    }
  }
}

function mix(l, r, mode, outL, outR, i) {
  if (mode === 1) r = l;
  else if (mode === 2) l = r;
  else if (mode === 3) l = r = 0.5 * (l + r);
  else if (mode === 4) l = r = 0.5 * (l - r);
  outL[i] = l;
  outR[i] = r;
}
