// AudioWorklet wrapper around LiveShifter for the YouTube panel.
import { LiveShifter } from "./live-core.js";

class LiveShiftProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.shifter = new LiveShifter(sampleRate);
    this.silence = new Float32Array(128);
    this.port.onmessage = (event) => {
      const { ratio, slow, mode } = event.data;
      this.shifter.chanMode = mode;
      this.shifter.configure(ratio, slow);
      this.port.postMessage({ latency: this.shifter.latency / sampleRate });
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const out = outputs[0];
    const n = out[0].length;
    if (this.silence.length < n) this.silence = new Float32Array(n);
    const inL = input[0] || this.silence;
    const inR = input[1] || inL;
    this.shifter.process(inL, inR, out[0], out[1] || out[0], n);
    return true;
  }
}

registerProcessor("live-shift", LiveShiftProcessor);
