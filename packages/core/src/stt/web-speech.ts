import type { TranscriptSource, TranscriptSourceCallbacks } from './types.js';

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export interface WebSpeechTranscriptSourceOptions {
  lang?: string;
}

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

/**
 * Zero-dependency transcript source built on the browser-native SpeechRecognition API.
 * NOTE: on some browsers (notably Chrome) recognition audio may be processed by a cloud
 * service. For a guaranteed-offline pipeline use OfflineTranscriptSource with a local
 * SttEngine (e.g. Whisper.cpp WASM).
 */
export class WebSpeechTranscriptSource implements TranscriptSource {
  static get supported(): boolean {
    return getSpeechRecognitionCtor() !== null;
  }

  private recognition: SpeechRecognitionLike | null = null;
  private callbacks: TranscriptSourceCallbacks | null = null;
  private running = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: WebSpeechTranscriptSourceOptions = {}) {}

  start(callbacks: TranscriptSourceCallbacks): Promise<void> {
    if (this.running) return Promise.resolve();
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      callbacks.onError('unsupported', 'SpeechRecognition is not available in this browser.');
      return Promise.resolve();
    }
    this.callbacks = callbacks;
    this.running = true;
    this.spinUp(new Ctor());
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.running = false;
    if (this.restartTimer !== null) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    try {
      this.recognition?.stop();
    } catch {
      // already stopped
    }
    this.recognition = null;
    this.callbacks = null;
    return Promise.resolve();
  }

  private spinUp(recognition: SpeechRecognitionLike): void {
    const callbacks = this.callbacks;
    if (!callbacks) return;

    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = this.opts.lang ?? 'en-US';

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const text = result[0].transcript.trim();
        if (text) callbacks.onUtterance(text);
      }
    };

    recognition.onerror = (event) => {
      const error = event.error;
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        this.running = false;
        callbacks.onError('mic-denied', error);
      } else if (error !== 'no-speech' && error !== 'aborted') {
        callbacks.onError('stt-failed', error);
      }
    };

    recognition.onend = () => {
      if (!this.running) return;
      // Chrome ends the session after silence; restart on a short delay to avoid
      // the InvalidStateError thrown when start() overlaps the previous session.
      this.restartTimer = setTimeout(() => {
        if (!this.running) return;
        try {
          recognition.start();
        } catch {
          // onend will fire again and retry
        }
      }, 250);
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch (err) {
      callbacks.onError('stt-failed', String(err));
    }
  }
}
