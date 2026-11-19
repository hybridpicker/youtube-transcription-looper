// Phase vocoder frame processor with identity phase locking: every spectral
// peak region gets one phase rotation, shared across channels so the stereo
// image stays intact. Used by the file player and the live pitch shifter.
import { FFT } from "./fft.js";

const TWO_PI = 2 * Math.PI;

export class PhaseVocoder {
  constructor(N, nch) {
    this.N = N;
    this.Hs = N / 4;
    this.nch = nch;
    const half = N / 2;
    this.fft = new FFT(N);
    this.win = new Float64Array(N);
    for (let n = 0; n < N; n++) this.win[n] = 0.5 - 0.5 * Math.cos((TWO_PI * n) / N);
    this.re = [];
    this.im = [];
    this.prevRe = [];
    this.prevIm = [];
    this.ola = [];
    for (let c = 0; c < nch; c++) {
      this.re.push(new Float64Array(N));
      this.im.push(new Float64Array(N));
      this.prevRe.push(new Float64Array(half + 1));
      this.prevIm.push(new Float64Array(half + 1));
      this.ola.push(new Float64Array(N));
    }
    this.power = new Float64Array(half + 1);
    this.theta = new Float64Array(half + 1);
    this.thetaNext = new Float64Array(half + 1);
    this.peaks = new Int32Array(half);
    this.reset = true;
  }

  clear() {
    for (let c = 0; c < this.nch; c++) this.ola[c].fill(0);
    this.reset = true;
  }

  // The caller fills re[c][0..N) with raw input samples first. `hopIn` is the
  // distance in input samples to the previous frame. Afterwards ola[c][0..Hs)
  // holds the next finished output hop; call advance() once it is consumed.
  frame(hopIn) {
    const N = this.N, Hs = this.Hs, half = N / 2, nch = this.nch, win = this.win;
    for (let c = 0; c < nch; c++) {
      const re = this.re[c], im = this.im[c];
      for (let n = 0; n < N; n++) re[n] *= win[n];
      im.fill(0);
      this.fft.transform(re, im);
    }

    const rotate = !(this.reset || hopIn < 1);
    const theta = this.theta, next = this.thetaNext;
    let npk = 0;
    if (rotate) {
      const pw = this.power, peaks = this.peaks;
      for (let k = 0; k <= half; k++) {
        let p = 0;
        for (let c = 0; c < nch; c++) p += this.re[c][k] * this.re[c][k] + this.im[c][k] * this.im[c][k];
        pw[k] = p;
      }
      for (let k = 2; k < half - 1; k++) {
        const m = pw[k];
        if (m > pw[k - 1] && m > pw[k - 2] && m >= pw[k + 1] && m >= pw[k + 2] && m > 1e-18) peaks[npk++] = k;
      }
      let lo = 0;
      for (let i = 0; i < npk; i++) {
        const p = peaks[i];
        // A region ends at the deepest valley before the next peak.
        let end = half + 1;
        if (i + 1 < npk) {
          const q = peaks[i + 1];
          let best = p + 1, bestV = pw[p + 1];
          for (let k = p + 2; k < q; k++) if (pw[k] < bestV) { bestV = pw[k]; best = k; }
          end = best;
        }
        let ref = 0;
        if (nch > 1) {
          const p0 = this.re[0][p] ** 2 + this.im[0][p] ** 2;
          const p1 = this.re[1][p] ** 2 + this.im[1][p] ** 2;
          if (p1 > p0) ref = 1;
        }
        const phi = Math.atan2(this.im[ref][p], this.re[ref][p]);
        const phiPrev = Math.atan2(this.prevIm[ref][p], this.prevRe[ref][p]);
        const omega = (TWO_PI * p) / N;
        let d = phi - phiPrev - omega * hopIn;
        d -= TWO_PI * Math.round(d / TWO_PI);
        let th = phiPrev + theta[p] + Hs * (omega + d / hopIn) - phi;
        th -= TWO_PI * Math.round(th / TWO_PI);
        for (let k = lo; k < end; k++) next[k] = th;
        lo = end;
      }
    }
    const rotated = rotate && npk > 0;
    if (!rotated) next.fill(0);
    this.reset = false;

    const norm = 1 / (N * 1.5);
    for (let c = 0; c < nch; c++) {
      const re = this.re[c], im = this.im[c], pr = this.prevRe[c], pi = this.prevIm[c];
      for (let k = 0; k <= half; k++) { pr[k] = re[k]; pi[k] = im[k]; }
      if (rotated) {
        let k = 0;
        while (k <= half) {
          const th = next[k];
          const cs = Math.cos(th), sn = Math.sin(th);
          let e = k;
          while (e <= half && next[e] === th) e++;
          for (; k < e; k++) {
            const xr = re[k], xi = im[k];
            const yr = xr * cs - xi * sn, yi = xr * sn + xi * cs;
            re[k] = yr; im[k] = yi;
            if (k > 0 && k < half) { re[N - k] = yr; im[N - k] = -yi; }
          }
        }
      }
      this.fft.transform(re, im, true);
      const ola = this.ola[c];
      for (let n = 0; n < N; n++) ola[n] += re[n] * win[n] * norm;
    }
    this.theta = next;
    this.thetaNext = theta;
  }

  advance() {
    const N = this.N, Hs = this.Hs;
    for (let c = 0; c < this.nch; c++) {
      this.ola[c].copyWithin(0, Hs);
      this.ola[c].fill(0, N - Hs);
    }
  }
}

export function hermite(y0, y1, y2, y3, t) {
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * t + c2) * t + c1) * t + y1;
}
