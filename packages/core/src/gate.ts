import type { IntentResult } from './needle/types.js';
import type { ActionRegistry } from './registry.js';

export type GateOutcome =
  | { kind: 'execute'; action: string; args: unknown; confidence: number }
  | { kind: 'clarify'; reason: string; confidence: number };

export class ConfidenceGate {
  constructor(private readonly threshold = 0.6) {}

  evaluate(intent: IntentResult, text: string, registry: ActionRegistry): GateOutcome {
    if (intent.kind === 'unknown') {
      return { kind: 'clarify', reason: `I couldn't find a matching action for "${text}".`, confidence: 0 };
    }
    if (intent.kind === 'clarify') {
      return { kind: 'clarify', reason: intent.reason, confidence: intent.confidence };
    }
    if (intent.confidence < this.threshold) {
      return {
        kind: 'clarify',
        reason: `I'm not confident enough (${fmt(intent.confidence)} < ${fmt(this.threshold)}) to run that. Could you rephrase, or name the action?`,
        confidence: intent.confidence,
      };
    }
    const def = registry.get(intent.action);
    if (!def) {
      return { kind: 'clarify', reason: `Action "${intent.action}" is not registered.`, confidence: intent.confidence };
    }
    const parsed = def.schema.safeParse(intent.args);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ');
      return {
        kind: 'clarify',
        reason: `I understood the action, but the parameters don't fit: ${issues}. Could you rephrase?`,
        confidence: intent.confidence,
      };
    }
    return { kind: 'execute', action: intent.action, args: parsed.data, confidence: intent.confidence };
  }
}

function fmt(n: number): string {
  return n.toFixed(2);
}
