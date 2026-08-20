import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { compileGrammar } from '../src/grammar.js';
import { HeuristicIntentEngine } from '../src/needle/heuristic.js';
import type { ToolSpec } from '../src/registry.js';

function tool(name: string, description: string, schema: z.ZodType): ToolSpec {
  return { name, description, parameters: compileGrammar(schema) };
}

const migrate = tool(
  'migrate_files',
  'Move selected files to a target destination folder',
  z.object({ destination: z.string() }),
);

describe('HeuristicIntentEngine', () => {
  it('matches an action by name and extracts quoted args', async () => {
    const engine = new HeuristicIntentEngine();
    const result = await engine.parse({ text: 'Migrate files to "Inbox"', context: {}, tools: [migrate] });
    expect(result).toMatchObject({ kind: 'execute', action: 'migrate_files', args: { destination: 'Inbox' } });
    if (result.kind === 'execute') {
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
      expect(result.confidence).toBeLessThanOrEqual(0.95);
    }
  });

  it('extracts named params and coerces numbers', async () => {
    const engine = new HeuristicIntentEngine();
    const volume = tool('set_volume', 'Set playback volume', z.object({ volume: z.number() }));
    const result = await engine.parse({ text: 'set volume 40', context: {}, tools: [volume] });
    expect(result).toMatchObject({ kind: 'execute', action: 'set_volume', args: { volume: 40 } });
  });

  it('coerces enum values case-insensitively', async () => {
    const engine = new HeuristicIntentEngine();
    const sorted = tool(
      'sort_files',
      'Sort the file list',
      z.object({ order: z.enum(['name', 'date']) }),
    );
    const result = await engine.parse({ text: 'sort files order "Name"', context: {}, tools: [sorted] });
    expect(result).toMatchObject({ kind: 'execute', args: { order: 'name' } });
  });

  it('asks for clarification when a required param is missing', async () => {
    const engine = new HeuristicIntentEngine();
    const result = await engine.parse({ text: 'Migrate files', context: {}, tools: [migrate] });
    expect(result.kind).toBe('clarify');
    if (result.kind === 'clarify') expect(result.reason).toContain('destination');
  });

  it('returns unknown for unmatched utterances', async () => {
    const engine = new HeuristicIntentEngine();
    const result = await engine.parse({ text: 'what is the weather', context: {}, tools: [migrate] });
    expect(result.kind).toBe('unknown');
  });

  it('penalizes ambiguous matches between similar tools', async () => {
    const engine = new HeuristicIntentEngine();
    const read = tool('read_messages', 'Read messages aloud', z.object({}));
    const send = tool('send_messages', 'Send messages to someone', z.object({}));
    const result = await engine.parse({ text: 'messages please', context: {}, tools: [read, send] });
    // Both tools tie on the "messages" token; ambiguity halving must push confidence below execute.
    const ambiguous = result.kind !== 'execute' || result.confidence < 0.6;
    expect(ambiguous).toBe(true);
  });

  it('scores vague paraphrases below the execute threshold', async () => {
    const engine = new HeuristicIntentEngine();
    const result = await engine.parse({ text: 'move selected items to "Archive"', context: {}, tools: [migrate] });
    expect(result.kind).toBe('execute');
    if (result.kind === 'execute') expect(result.confidence).toBeLessThan(0.6);
  });
});
