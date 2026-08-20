import { SpeechSegmenter, type VadOptions } from '../audio/energy-vad.js';
import type { FrameSource } from '../audio/mic-source.js';
import type { SttEngine, TranscriptSource, TranscriptSourceCallbacks } from './types.js';

export interface OfflineTranscriptSourceOptions {
  frameSource: FrameSource;
  stt: SttEngine;
  sampleRate?: number;
  vad?: VadOptions;
}

/**
 * Guaranteed-offline transcript source: local mic frames → local VAD segmentation →
 * local SttEngine (e.g. Whisper.cpp WASM). Nothing leaves the device.
 */
export class OfflineTranscriptSource implements TranscriptSource {
  private callbacks: TranscriptSourceCallbacks | null = null;
  private readonly segmenter: SpeechSegmenter;
  private readonly sampleRate: number;

  constructor(private readonly opts: OfflineTranscriptSourceOptions) {
    this.sampleRate = opts.sampleRate ?? 16000;
    this.segmenter = new SpeechSegmenter((segment) => void this.onSegment(segment), opts.vad);
  }

  async start(callbacks: TranscriptSourceCallbacks): Promise<void> {
    if (this.callbacks) return;
    this.callbacks = callbacks;
    try {
      await this.opts.frameSource.start((frame) => {
        this.segmenter.push(frame);
      });
    } catch (err) {
      this.callbacks = null;
      const code = (err as { name?: string }).name === 'MicPermissionError' ? 'mic-denied' : 'stt-failed';
      callbacks.onError(code, String(err));
    }
  }

  async stop(): Promise<void> {
    if (!this.callbacks) return;
    await this.opts.frameSource.stop();
    this.segmenter.flush();
    this.callbacks = null;
  }

  private async onSegment(segment: Float32Array): Promise<void> {
    const callbacks = this.callbacks;
    if (!callbacks) return;
    try {
      const text = (await this.opts.stt.transcribe(segment, this.sampleRate)).trim();
      if (text) callbacks.onUtterance(text);
    } catch (err) {
      callbacks.onError('stt-failed', String(err));
    }
  }
}
