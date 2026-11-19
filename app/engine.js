// Main-thread side of the playback engine: decoding, the worklet node and the
// tone-shaping chain behind it. Times are in seconds here.
export class Engine extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    this.node = null;
    this.buffer = null;
    this.pos = 0;
    this.playing = false;
    this.ended = false;
    this.rate = 1;
    this.semitones = 0;
  }

  get sampleRate() { return this.ctx.sampleRate; }
  get duration() { return this.buffer ? this.buffer.duration : 0; }

  async init() {
    if (this.ctx) return;
    this.ctx = new AudioContext({ latencyHint: "interactive" });
    await this.ctx.audioWorklet.addModule(new URL("./stretch-worklet.js", import.meta.url));
    this.node = new AudioWorkletNode(this.ctx, "stretch", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });
    this.node.port.onmessage = (event) => {
      const { pos, playing, ended } = event.data;
      this.pos = pos / this.sampleRate;
      const changed = playing !== this.playing || ended !== this.ended;
      this.playing = playing;
      this.ended = ended;
      if (changed) this.dispatchEvent(new Event("state"));
    };
    this.highpass = new BiquadFilterNode(this.ctx, { type: "highpass", frequency: 10, Q: 0.707 });
    this.highpass2 = new BiquadFilterNode(this.ctx, { type: "highpass", frequency: 10, Q: 0.707 });
    this.lowpass = new BiquadFilterNode(this.ctx, { type: "lowpass", frequency: 22000, Q: 0.707 });
    this.lowpass2 = new BiquadFilterNode(this.ctx, { type: "lowpass", frequency: 22000, Q: 0.707 });
    this.volume = new GainNode(this.ctx, { gain: 1 });
    this.node.connect(this.highpass).connect(this.highpass2).connect(this.lowpass)
      .connect(this.lowpass2).connect(this.volume).connect(this.ctx.destination);
  }

  async load(arrayBuffer) {
    await this.init();
    const buffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.buffer = buffer;
    const channels = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c).slice());
    this.pos = 0;
    this.playing = false;
    this.ended = false;
    this.node.port.postMessage({ type: "load", channels }, channels.map((ch) => ch.buffer));
    this.setParams(this.rate, this.semitones);
    return buffer;
  }

  async play(on) {
    if (!this.buffer) return;
    if (on && this.ctx.state !== "running") await this.ctx.resume();
    this.node.port.postMessage({ type: "play", on });
  }

  seek(seconds) {
    if (!this.buffer) return;
    this.pos = Math.max(0, Math.min(seconds, this.duration));
    this.node.port.postMessage({ type: "seek", pos: this.pos * this.sampleRate });
  }

  setParams(rate, semitones) {
    this.rate = rate;
    this.semitones = semitones;
    this.node?.port.postMessage({ type: "params", rate, pitch: 2 ** (semitones / 12) });
  }

  setLoop(on, a, b) {
    this.node?.port.postMessage({ type: "loop", on, a: a * this.sampleRate, b: b * this.sampleRate });
  }

  setGap(seconds) {
    this.node?.port.postMessage({ type: "gap", samples: seconds * this.sampleRate });
  }

  setChannelMode(mode) {
    this.node?.port.postMessage({ type: "channel", mode });
  }

  // Band limits in Hz; pass the full range to switch the filters off.
  setBand(lowHz, highHz) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const f of [this.highpass, this.highpass2]) f.frequency.setTargetAtTime(Math.max(10, lowHz), t, 0.015);
    for (const f of [this.lowpass, this.lowpass2]) f.frequency.setTargetAtTime(Math.min(22000, highHz), t, 0.015);
  }

  setVolume(value) {
    this.volume?.gain.setTargetAtTime(value, this.ctx.currentTime, 0.015);
  }

  // Short reference tone for comparing a heard note with a known pitch.
  startTone(frequency) {
    if (!this.ctx) return () => {};
    if (this.ctx.state !== "running") this.ctx.resume();
    const t = this.ctx.currentTime;
    const osc = new OscillatorNode(this.ctx, { type: "triangle", frequency });
    const gain = new GainNode(this.ctx, { gain: 0 });
    gain.gain.setTargetAtTime(0.25, t, 0.008);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    return () => {
      const end = this.ctx.currentTime;
      gain.gain.setTargetAtTime(0, end, 0.04);
      osc.stop(end + 0.4);
    };
  }
}
