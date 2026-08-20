import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { TasuketeEventMap } from '../src/events.js';
import { TasuketeEngine } from '../src/engine.js';
import type { FeedbackDispatcher } from '../src/feedback.js';
import type { TranscriptSource, TranscriptSourceCallbacks } from '../src/stt/types.js';

class FakeSource implements TranscriptSource {
  started = false;
  callbacks: TranscriptSourceCallbacks | null = null;
  async start(callbacks: TranscriptSourceCallbacks): Promise<void> {
    this.started = true;
    this.callbacks = callbacks;
  }
  async stop(): Promise<void> {
    this.started = false;
    this.callbacks = null;
  }
  say(text: string): void {
    this.callbacks?.onUtterance(text);
  }
}

class CaptureFeedback implements FeedbackDispatcher {
  messages: string[] = [];
  announce(text: string): void {
    this.messages.push(text);
  }
}

function once<K extends keyof TasuketeEventMap>(engine: TasuketeEngine, event: K): Promise<TasuketeEventMap[K]> {
  return new Promise((resolve) => engine.on(event, (e) => resolve(e)));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const state = { currentPath: '/docs', selectedIds: ['a', 'b'] };

function createEngine(overrides: Partial<ConstructorParameters<typeof TasuketeEngine>[0]> = {}) {
  const source = new FakeSource();
  const feedback = new CaptureFeedback();
  const engine = new TasuketeEngine({
    contextProvider: () => ({
      activeDirectory: state.currentPath,
      selectedFileIds: state.selectedIds,
    }),
    transcriptSource: source,
    feedback,
    ...overrides,
  });
  engine.registerAction({
    name: 'migrate_files',
    description: 'Move selected files to a target destination folder',
    schema: z.object({ destination: z.string().describe('Target folder name or path ID') }),
    handler: async (args, context) => {
      const ids = (context as { selectedFileIds: string[] }).selectedFileIds;
      if (ids.length === 0) return 'No files are currently selected.';
      return `Successfully moved ${ids.length} items to ${args.destination}.`;
    },
  });
  return { engine, source, feedback };
}

describe('TasuketeEngine', () => {
  it('executes the SPEC.md migrate_files flow end to end', async () => {
    const { engine, source, feedback } = createEngine();
    await engine.start();
    expect(source.started).toBe(true);

    const action = once(engine, 'action');
    const transcript = once(engine, 'transcript');
    source.say('Migrate files to "Inbox"');

    await transcript;
    const event = await action;
    expect(event.name).toBe('migrate_files');
    expect(event.args).toEqual({ destination: 'Inbox' });
    expect(event.result).toBe('Successfully moved 2 items to Inbox.');
    expect(event.confidence).toBeGreaterThanOrEqual(0.6);
    expect(feedback.messages.at(-1)).toBe('Successfully moved 2 items to Inbox.');
    await engine.stop();
  });

  it('passes a frozen context snapshot to the handler', async () => {
    const contexts: unknown[] = [];
    const { engine } = createEngine({
      intentEngine: {
        parse: async ({ text }) =>
          text.includes('inspect')
            ? { kind: 'execute', action: 'inspect_context', args: {}, confidence: 0.9 }
            : { kind: 'execute', action: 'migrate_files', args: { destination: 'X' }, confidence: 0.9 },
        async load() {},
      },
    });
    engine.registerAction({
      name: 'inspect_context',
      description: 'Inspect context for tests',
      schema: z.object({}),
      handler: async (_args, context) => {
        contexts.push(context);
        return 'inspected';
      },
    });
    const action = once(engine, 'action');
    await engine.processUtterance('inspect context');
    await action;
    const context = contexts[0] as Record<string, unknown>;
    expect(context.selectedFileIds).toEqual(['a', 'b']);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it('clarifies when a required parameter is missing', async () => {
    const { engine, source, feedback } = createEngine();
    await engine.start();
    const clarify = once(engine, 'clarify');
    source.say('move these files');
    const event = await clarify;
    expect(event.confidence).toBeLessThan(0.6);
    expect(event.reason).toContain('destination');
    expect(feedback.messages.at(-1)).toBe(event.reason);
    await engine.stop();
  });

  it('clarifies instead of executing low-confidence intents', async () => {
    const { engine, source, feedback } = createEngine();
    await engine.start();
    const clarify = once(engine, 'clarify');
    source.say('move selected items to "Archive"');
    const event = await clarify;
    expect(event.confidence).toBeLessThan(0.6);
    expect(event.reason).toContain('confident');
    expect(feedback.messages.at(-1)).toBe(event.reason);
    await engine.stop();
  });

  it('announces failure and emits an error event when a handler throws', async () => {
    const source = new FakeSource();
    const feedback = new CaptureFeedback();
    const engine = new TasuketeEngine({
      contextProvider: () => ({}),
      transcriptSource: source,
      feedback,
      intentEngine: {
        parse: async () => ({ kind: 'execute', action: 'boom_action', args: {}, confidence: 0.9 }),
      },
    });
    engine.registerAction({
      name: 'boom_action',
      description: 'Always throws',
      schema: z.object({}),
      handler: async () => {
        throw new Error('boom');
      },
    });
    await engine.start();
    const engineError = once(engine, 'error');
    source.say('do the boom');
    const event = await engineError;
    expect(event.code).toBe('handler-failed');
    expect(event.detail).toContain('boom');
    expect(feedback.messages.at(-1)).toBe('That action failed.');
    await engine.stop();
  });

  it('processes utterances serially and in order', async () => {
    let active = 0;
    let maxActive = 0;
    const order: string[] = [];
    const source = new FakeSource();
    const engine = new TasuketeEngine({
      contextProvider: () => ({}),
      transcriptSource: source,
      feedback: new CaptureFeedback(),
    });
    engine.registerAction({
      name: 'migrate_files',
      description: 'Move selected files to a target destination folder',
      schema: z.object({ destination: z.string() }),
      handler: async (args) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await sleep(10);
        order.push(args.destination);
        active--;
        return `moved to ${args.destination}`;
      },
    });
    await engine.start();
    const actions: TasuketeEventMap['action'][] = [];
    engine.on('action', (event) => actions.push(event));
    source.say('migrate files to "First"');
    source.say('migrate files to "Second"');
    await vi.waitFor(() => expect(actions).toHaveLength(2));
    expect(actions.map((event) => event.args)).toEqual([{ destination: 'First' }, { destination: 'Second' }]);
    expect(maxActive).toBe(1);
    expect(order).toEqual(['First', 'Second']);
    await engine.stop();
  });

  it('resolves processUtterance only after the utterance is handled', async () => {
    const { engine, feedback } = createEngine();
    await engine.processUtterance('Migrate files to "Inbox"');
    expect(feedback.messages).toContain('Successfully moved 2 items to Inbox.');
  });

  it('reports handler "no selection" results through the action event', async () => {
    const { engine, source } = createEngine({
      contextProvider: () => ({ selectedFileIds: [] }),
    });
    await engine.start();
    const action = once(engine, 'action');
    source.say('Migrate files to "Inbox"');
    const event = await action;
    expect(event.result).toBe('No files are currently selected.');
    await engine.stop();
  });

  it('propagates transcript source startup failures as mic-denied', async () => {
    const source: TranscriptSource = {
      start: async () => {
        throw Object.assign(new Error('denied'), { name: 'MicPermissionError' });
      },
      stop: async () => {},
    };
    const { engine: ok } = { engine: new TasuketeEngine({ contextProvider: () => ({}), transcriptSource: source }) };
    const errorEvent = once(ok, 'error');
    await expect(ok.start()).rejects.toThrow();
    expect((await errorEvent).code).toBe('mic-denied');
  });
});

describe('TasuketeEngine registration errors', () => {
  it('emits a registration error event and rethrows invalid actions', () => {
    const { engine } = createEngine();
    const errorEvent = once(engine, 'error');
    expect(() =>
      engine.registerAction({
        name: 'BadName',
        description: 'x',
        schema: z.object({}),
        handler: () => 'ok',
      }),
    ).toThrow(/snake_case/);
    expect(errorEvent).toBeDefined();
  });
});
