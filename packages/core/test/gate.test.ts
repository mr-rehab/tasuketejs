import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ConfidenceGate, type GateOutcome } from '../src/gate.js';
import { ActionRegistry } from '../src/registry.js';

function clarifyOf(outcome: GateOutcome): string {
  if (outcome.kind !== 'clarify') throw new Error(`expected clarify, got ${outcome.kind}`);
  return outcome.reason;
}

function registryWith(...actions: Parameters<ActionRegistry['register']>[0][]) {
  const registry = new ActionRegistry();
  for (const action of actions) registry.register(action);
  return registry;
}

describe('ConfidenceGate', () => {
  const registry = registryWith({
    name: 'migrate_files',
    description: 'Move selected files to a target destination folder',
    schema: z.object({ destination: z.string() }),
    handler: async () => 'done',
  });

  it('routes unknown intents to clarify', () => {
    const gate = new ConfidenceGate(0.6);
    const outcome = gate.evaluate({ kind: 'unknown', reason: 'no match' }, 'blah', registry);
    expect(outcome.kind).toBe('clarify');
    expect(clarifyOf(outcome)).toContain('blah');
  });

  it('passes clarify intents through', () => {
    const gate = new ConfidenceGate(0.6);
    const outcome = gate.evaluate({ kind: 'clarify', reason: 'missing destination', confidence: 0.9 }, 'x', registry);
    expect(outcome).toEqual({ kind: 'clarify', reason: 'missing destination', confidence: 0.9 });
  });

  it('suppresses sub-threshold intents', () => {
    const gate = new ConfidenceGate(0.6);
    const outcome = gate.evaluate(
      { kind: 'execute', action: 'migrate_files', args: { destination: 'Inbox' }, confidence: 0.42 },
      'move these files',
      registry,
    );
    expect(outcome.kind).toBe('clarify');
    expect(clarifyOf(outcome)).toContain('0.42 < 0.60');
  });

  it('clarifies when args fail schema validation', () => {
    const gate = new ConfidenceGate(0.6);
    const outcome = gate.evaluate(
      { kind: 'execute', action: 'migrate_files', args: { destination: 42 }, confidence: 0.9 },
      'migrate files',
      registry,
    );
    expect(outcome.kind).toBe('clarify');
    expect(clarifyOf(outcome)).toContain("parameters don't fit");
  });

  it('executes valid high-confidence intents', () => {
    const gate = new ConfidenceGate(0.6);
    const outcome = gate.evaluate(
      { kind: 'execute', action: 'migrate_files', args: { destination: 'Inbox' }, confidence: 0.9 },
      'migrate files to Inbox',
      registry,
    );
    expect(outcome).toEqual({ kind: 'execute', action: 'migrate_files', args: { destination: 'Inbox' }, confidence: 0.9 });
  });

  it('clarifies intents targeting unregistered actions', () => {
    const empty = new ActionRegistry();
    const gate = new ConfidenceGate(0.6);
    const outcome = gate.evaluate(
      { kind: 'execute', action: 'ghost_action', args: {}, confidence: 0.99 },
      'do the thing',
      empty,
    );
    expect(outcome.kind).toBe('clarify');
    expect(clarifyOf(outcome)).toContain('not registered');
  });
});
