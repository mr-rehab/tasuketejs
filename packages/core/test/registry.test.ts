import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { UnsupportedGrammarError } from '../src/grammar.js';
import { ActionRegistry, ArgsValidationError } from '../src/registry.js';

const migrateSchema = z.object({ destination: z.string() });

const migrate = {
  name: 'migrate_files',
  description: 'Move selected files to a target destination folder',
  schema: migrateSchema,
  handler: async (args: z.output<typeof migrateSchema>) => `moved to ${args.destination}`,
};

describe('ActionRegistry', () => {
  it('registers actions and exposes tool specs', () => {
    const registry = new ActionRegistry();
    registry.register(migrate);
    expect(registry.size).toBe(1);
    expect(registry.has('migrate_files')).toBe(true);
    const tools = registry.toolSpecs();
    expect(tools[0].name).toBe('migrate_files');
    expect(tools[0].parameters.type).toBe('object');
  });

  it('rejects invalid names', () => {
    const registry = new ActionRegistry();
    expect(() => registry.register({ ...migrate, name: 'MigrateFiles' })).toThrow(/snake_case/);
    expect(() => registry.register({ ...migrate, name: 'x' })).toThrow(/Invalid action name/);
  });

  it('rejects duplicates, missing descriptions, and missing handlers', () => {
    const registry = new ActionRegistry();
    registry.register(migrate);
    expect(() => registry.register(migrate)).toThrow(/already registered/);
    expect(() => registry.register({ ...migrate, name: 'other_action', description: '' })).toThrow(/description/);
    expect(() =>
      registry.register({ ...migrate, name: 'other_action', handler: undefined as never }),
    ).toThrow(/handler/);
  });

  it('supports unregistration via the returned dispose fn', () => {
    const registry = new ActionRegistry();
    const dispose = registry.register(migrate);
    dispose();
    expect(registry.size).toBe(0);
  });

  it('dispatches validated args with the frozen context', async () => {
    const registry = new ActionRegistry();
    registry.register(migrate);
    const context = Object.freeze({}) as Record<string, unknown>;
    const result = await registry.dispatch('migrate_files', { destination: 'Inbox' }, context);
    expect(result).toBe('moved to Inbox');
  });

  it('throws ArgsValidationError on invalid args', async () => {
    const registry = new ActionRegistry();
    registry.register(migrate);
    await expect(registry.dispatch('migrate_files', { destination: 42 }, {})).rejects.toBeInstanceOf(ArgsValidationError);
    await expect(registry.dispatch('migrate_files', {}, {})).rejects.toThrow(/destination/);
  });

  it('throws on unknown actions and empty handler results', async () => {
    const registry = new ActionRegistry();
    registry.register(migrate);
    await expect(registry.dispatch('ghost', {}, {})).rejects.toThrow(/Unknown action/);
    registry.register({ ...migrate, name: 'silent_action', handler: async () => '' });
    await expect(registry.dispatch('silent_action', { destination: 'x' }, {})).rejects.toThrow(
      /non-empty announcement/,
    );
  });

  it('fails registration early on unsupported schemas', () => {
    const registry = new ActionRegistry();
    expect(() =>
      registry.register({
        name: 'bad_schema',
        description: 'unsupported shape',
        schema: z.record(z.string(), z.string()),
        handler: async () => 'ok',
      }),
    ).toThrow(UnsupportedGrammarError);
  });
});
