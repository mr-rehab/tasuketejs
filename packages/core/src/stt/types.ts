import type { TasuketeErrorCode } from '../events.js';

export interface TranscriptSourceCallbacks {
  onUtterance(text: string): void;
  onError(code: TasuketeErrorCode, detail?: string): void;
}

export interface TranscriptSource {
  start(callbacks: TranscriptSourceCallbacks): Promise<void>;
  stop(): Promise<void>;
}

export interface SttEngine {
  transcribe(segment: Float32Array, sampleRate: number): Promise<string>;
}
