import type { z } from 'zod';
import { ContextStore, type ContextProvider, type ContextSnapshot } from './context.js';
import { TasuketeEventBus, type TasuketeEventMap } from './events.js';
import { SpeechSynthesisFeedback, type FeedbackDispatcher } from './feedback.js';
import { ConfidenceGate } from './gate.js';
import { HeuristicIntentEngine } from './needle/heuristic.js';
import type { IntentEngine } from './needle/types.js';
import { ActionRegistry, type ActionDefinition } from './registry.js';
import type { TranscriptSource } from './stt/types.js';

export interface TasuketeEngineOptions {
  contextProvider: ContextProvider;
  transcriptSource: TranscriptSource;
  intentEngine?: IntentEngine;
  confidenceThreshold?: number;
  feedback?: FeedbackDispatcher | null;
  contextByteLimit?: number;
}

interface QueueItem {
  text: string;
  resolve: () => void;
}

export class TasuketeEngine {
  readonly events = new TasuketeEventBus();

  private readonly registry = new ActionRegistry();
  private readonly contextStore: ContextStore;
  private readonly gate: ConfidenceGate;
  private readonly intentEngine: IntentEngine;
  private readonly feedback: FeedbackDispatcher | null;
  private readonly source: TranscriptSource;
  private started = false;
  private destroyed = false;
  private queue: QueueItem[] = [];
  private draining = false;

  constructor(options: TasuketeEngineOptions) {
    this.contextStore = new ContextStore(options.contextProvider, options.contextByteLimit);
    this.gate = new ConfidenceGate(options.confidenceThreshold ?? 0.6);
    this.intentEngine = options.intentEngine ?? new HeuristicIntentEngine();
    this.feedback = options.feedback === undefined ? new SpeechSynthesisFeedback() : options.feedback;
    this.source = options.transcriptSource;
  }

  on<K extends keyof TasuketeEventMap>(event: K, listener: (event: TasuketeEventMap[K]) => void): () => void {
    return this.events.on(event, listener);
  }

  registerAction<TSchema extends z.ZodType>(def: ActionDefinition<TSchema>): () => void {
    try {
      return this.registry.register(def);
    } catch (err) {
      this.events.emit('error', { code: 'registration', detail: String(err) });
      throw err;
    }
  }

  get actionCount(): number {
    return this.registry.size;
  }

  get context(): ContextSnapshot | null {
    return this.contextStore.current;
  }

  get running(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.destroyed) throw new Error('Engine was destroyed — create a new instance.');
    if (this.started) return;
    try {
      await this.intentEngine.load?.();
    } catch (err) {
      this.events.emit('error', { code: 'model-load', detail: String(err) });
      throw err;
    }
    try {
      await this.source.start({
        onUtterance: (text) => void this.enqueue(text),
        onError: (code, detail) => { this.events.emit('error', { code, detail }); },
      });
    } catch (err) {
      const code = (err as { name?: string }).name === 'MicPermissionError' ? 'mic-denied' : 'stt-failed';
      this.events.emit('error', { code, detail: String(err) });
      throw err;
    }
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    await this.source.stop();
  }

  async destroy(): Promise<void> {
    await this.stop();
    await this.intentEngine.dispose?.();
    this.events.removeAll();
    this.destroyed = true;
  }

  async processUtterance(text: string): Promise<void> {
    await this.enqueue(text);
  }

  private enqueue(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.queue.push({ text: trimmed, resolve });
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) continue;
        try {
          await this.handle(item.text);
        } finally {
          item.resolve();
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private async handle(text: string): Promise<void> {
    const context = this.contextStore.capture();
    this.events.emit('transcript', { text });

    let intent;
    try {
      intent = await this.intentEngine.parse({ text, context, tools: this.registry.toolSpecs() });
    } catch (err) {
      this.events.emit('error', { code: 'intent-failed', detail: String(err) });
      this.announce('Sorry, I could not process that.');
      return;
    }

    const outcome = this.gate.evaluate(intent, text, this.registry);
    if (outcome.kind === 'clarify') {
      this.events.emit('clarify', { reason: outcome.reason, confidence: outcome.confidence, text });
      this.announce(outcome.reason);
      return;
    }

    let result: string;
    try {
      result = await this.registry.dispatch(outcome.action, outcome.args, context);
    } catch (err) {
      this.events.emit('error', { code: 'handler-failed', detail: String(err) });
      this.announce('That action failed.');
      return;
    }

    this.events.emit('action', {
      name: outcome.action,
      args: outcome.args,
      result,
      confidence: outcome.confidence,
    });
    this.announce(result);
  }

  private announce(text: string): void {
    if (!this.feedback) return;
    try {
      this.feedback.announce(text);
    } catch {
      // feedback failures must never break the pipeline
    }
  }
}
