import { describe, expect, it, vi } from 'vitest';
import { Needle2Engine, type Needle2Factory } from '../src/needle/needle2.js';
import { compileGrammar } from '../src/grammar.js';
import { z } from 'zod';

const tools = [
  {
    name: 'migrate_files',
    description: 'Move selected files',
    parameters: compileGrammar(z.object({ destination: z.string() })),
  },
];

describe('Needle2Engine', () => {
  it('requires a module or url', () => {
    expect(() => new Needle2Engine({})).toThrow(/module.*factory|url/i);
  });

  it('loads a factory module and maps run output to intents', async () => {
    const factory: Needle2Factory = async () => ({
      run: async ({ text }) =>
        text.includes('move')
          ? { action: 'migrate_files', args: { destination: 'Inbox' }, confidence: 0.92 }
          : { action: null, raw: text },
    });
    const engine = new Needle2Engine({ module: factory });
    await engine.load();
    const hit = await engine.parse({ text: 'move files', context: {}, tools });
    expect(hit).toEqual({
      kind: 'execute',
      action: 'migrate_files',
      args: { destination: 'Inbox' },
      confidence: 0.92,
    });
    const miss = await engine.parse({ text: 'hello', context: {}, tools });
    expect(miss.kind).toBe('unknown');
  });

  it('clarifies when used before load completes', async () => {
    const engine = new Needle2Engine({ module: async () => ({ run: async () => ({ action: null }) }) });
    const result = await engine.parse({ text: 'anything', context: {}, tools });
    expect(result.kind).toBe('clarify');
  });

  it('disposes the session when the RAM budget is exceeded', async () => {
    const budget = 1024;
    const onDispose = vi.fn();
    const onError = vi.fn();
    const factory: Needle2Factory = async () => ({
      run: async () => ({ action: 'migrate_files', args: {}, confidence: 1 }),
      memoryBytes: () => budget * 2,
      dispose: onDispose,
    });
    const engine = new Needle2Engine({ module: factory, ramBudgetBytes: budget, onError });
    await expect(engine.load()).rejects.toThrow(/RAM budget/);
    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('RAM budget'));
  });

  it('throws when a url asset lacks the factory export', async () => {
    const engine = new Needle2Engine({ url: 'file:///nonexistent-asset.mjs' });
    await expect(engine.load()).rejects.toThrow();
  });
});
