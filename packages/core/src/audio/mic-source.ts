import { FRAME_WORKLET_SRC, TASUKETE_FRAMER_NAME } from './worklet.js';

export interface FrameSource {
  start(onFrame: (frame: Float32Array) => void): Promise<void>;
  stop(): Promise<void>;
}

export class MicPermissionError extends Error {
  constructor(detail?: string) {
    super(`Microphone permission denied${detail ? ': ' + detail : '.'}`);
    this.name = 'MicPermissionError';
  }
}

export interface MicSourceOptions {
  frameSamples?: number;
  sampleRate?: number;
}

export class MicSource implements FrameSource {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;

  constructor(private readonly opts: MicSourceOptions = {}) {}

  async start(onFrame: (frame: Float32Array) => void): Promise<void> {
    if (this.ctx) return;
    const mediaDevices = (globalThis as { navigator?: { mediaDevices?: { getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream> } } }).navigator?.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      throw new Error('getUserMedia is not available — a secure context (HTTPS or localhost) is required.');
    }

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
    } catch (err) {
      if ((err as { name?: string }).name === 'NotAllowedError') throw new MicPermissionError();
      throw err;
    }

    const ctx = new AudioContext({ sampleRate: this.opts.sampleRate ?? 16000 });
    try {
      await ctx.audioWorklet.addModule(workletUrl());
    } catch (err) {
      stream.getTracks().forEach((track) => { track.stop(); });
      await ctx.close().catch(() => undefined);
      throw new Error(`Failed to load audio worklet: ${String(err)}`, { cause: err });
    }

    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, TASUKETE_FRAMER_NAME, {
      processorOptions: { frameSamples: this.opts.frameSamples ?? 512 },
    });
    node.port.onmessage = (event) => { onFrame(event.data as Float32Array); };
    source.connect(node);
    node.connect(ctx.destination);

    this.ctx = ctx;
    this.stream = stream;
    this.node = node;
  }

  async stop(): Promise<void> {
    this.node?.port.close();
    this.node?.disconnect();
    this.node = null;
    this.stream?.getTracks().forEach((track) => { track.stop(); });
    this.stream = null;
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}

let cachedWorkletUrl: string | null = null;

function workletUrl(): string {
  cachedWorkletUrl ??= URL.createObjectURL(new Blob([FRAME_WORKLET_SRC], { type: 'text/javascript' }));
  return cachedWorkletUrl;
}
