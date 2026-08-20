export const TASUKETE_FRAMER_NAME = 'tasukete-framer';

export const FRAME_WORKLET_SRC = `
class TasuketeFramer extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const po = (options && options.processorOptions) || {};
    this.size = po.frameSamples || 512;
    this.buf = new Float32Array(this.size);
    this.n = 0;
  }
  process(inputs) {
    const input = inputs[0];
    const channel = input && input[0];
    if (!channel) return true;
    let i = 0;
    while (i < channel.length) {
      const take = Math.min(channel.length - i, this.size - this.n);
      this.buf.set(channel.subarray(i, i + take), this.n);
      this.n += take;
      i += take;
      if (this.n === this.size) {
        this.port.postMessage(this.buf.slice(0));
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('${TASUKETE_FRAMER_NAME}', TasuketeFramer);
`;
