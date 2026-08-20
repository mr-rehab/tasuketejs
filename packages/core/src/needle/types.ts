import type { ContextSnapshot } from '../context.js';
import type { ToolSpec } from '../registry.js';

/** What an intent engine receives per utterance. */
export interface IntentInput {
  text: string;
  context: ContextSnapshot;
  tools: ToolSpec[];
}

/** The three possible outcomes of intent recognition. */
export type IntentResult = ExecuteIntent | ClarifyIntent | UnknownIntent;

export interface ExecuteIntent {
  kind: 'execute';
  action: string;
  args: unknown;
  confidence: number;
}

export interface ClarifyIntent {
  kind: 'clarify';
  reason: string;
  confidence: number;
}

export interface UnknownIntent {
  kind: 'unknown';
  reason: string;
}

/**
 * Pluggable intent recognizer. Implement this to adapt any local model;
 * `load` runs on `engine.start()`, `dispose` on `engine.destroy()`.
 */
export interface IntentEngine {
  load?(): Promise<void>;
  parse(input: IntentInput): Promise<IntentResult>;
  dispose?(): void | Promise<void>;
}
