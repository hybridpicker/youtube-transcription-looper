// AudioWorklet wrapper around the Stretcher core. All positions are in samples.
import { Stretcher } from "./stretch-core.js";

const REPORT_EVERY = 4; // render quanta (~11 ms at 44.1 kHz)

class StretchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.st = null;
    this.count = 0;
    this.lastPlaying = false;
    this.port.onmessage = (event) => this.onMessage(event.data);
  }

  onMessage(msg) {
    if (msg.type === "load") {
      this.st = new Stretcher(msg.channels, sampleRate);
      this.report();
      return;
    }
    const st = this.st;
    if (!st) return;
    switch (msg.type) {
      case "unload": this.st = null; break;
      case "play": st.setPlaying(msg.on); break;
      case "seek": st.seek(msg.pos); break;
      case "params": st.setParams(msg.rate, msg.pitch); break;
      case "loop": st.setLoop(msg.on, msg.a, msg.b); break;
      case "gap": st.gap = Math.max(0, Math.round(msg.samples)); break;
      case "channel": st.chanMode = msg.mode; break;
    }
    this.report();
  }

  report() {
    const st = this.st;
    if (!st) return;
    this.lastPlaying = st.playing;
    this.port.postMessage({ pos: st.position(), playing: st.playing, ended: st.ended });
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const st = this.st;
    if (!st) return true;
    st.process(out[0], out[1] || out[0], out[0].length);
    const active = st.playing || this.lastPlaying;
    if (active && (++this.count >= REPORT_EVERY || st.playing !== this.lastPlaying)) {
      this.count = 0;
      this.report();
    }
    return true;
  }
}

registerProcessor("stretch", StretchProcessor);
