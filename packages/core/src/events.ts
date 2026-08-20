export interface TranscriptEvent {
  text: string;
}

export interface ActionEvent {
  name: string;
  args: unknown;
  result: string;
  confidence: number;
}

export interface ClarifyEvent {
  reason: string;
  confidence: number;
  text: string;
}

export type TasuketeErrorCode =
  | 'mic-denied'
  | 'model-load'
  | 'intent-failed'
  | 'handler-failed'
  | 'stt-failed'
  | 'unsupported'
  | 'registration';

export interface TasuketeErrorEvent {
  code: TasuketeErrorCode;
  detail?: string;
}

/** Every pipeline event; keys of this map are the names accepted by `engine.on`. */
export interface TasuketeEventMap {
  /** A finalized utterance entered the pipeline. */
  transcript: TranscriptEvent;
  /** An action handler completed successfully. */
  action: ActionEvent;
  /** The engine is asking the user a question instead of executing. */
  clarify: ClarifyEvent;
  /** A failure anywhere in the pipeline. */
  error: TasuketeErrorEvent;
}

export type TasuketeEventName = keyof TasuketeEventMap;

// A listener accepting `never` is contravariant-compatible with every specific
// event listener, which keeps the bus fully typed without per-event storage.
type AnyListener = (event: never) => void;

/** Minimal typed pub/sub; listener exceptions are swallowed so UI code can never stall the voice pipeline. */
export class TasuketeEventBus {
  private readonly listeners = new Map<string, Set<AnyListener>>();

  on<K extends TasuketeEventName>(name: K, listener: (event: TasuketeEventMap[K]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  emit<K extends TasuketeEventName>(name: K, event: TasuketeEventMap[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(event as never);
      } catch {
        // A broken listener must never break the voice pipeline.
      }
    }
  }

  removeAll(): void {
    this.listeners.clear();
  }
}
