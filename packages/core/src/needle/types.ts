import type { ContextSnapshot } from '../context.js';
import type { ToolSpec } from '../registry.js';

export interface IntentInput {
  text: string;
  context: ContextSnapshot;
  tools: ToolSpec[];
}

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

export interface IntentEngine {
  load?(): Promise<void>;
  parse(input: IntentInput): Promise<IntentResult>;
  dispose?(): void | Promise<void>;
}
