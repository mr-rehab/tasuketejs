import type { ToolSpec } from '../registry.js';
import type { IntentEngine, IntentInput, IntentResult } from './types.js';

export interface Needle2RunOutput {
  action: string | null;
  args?: unknown;
  confidence?: number;
  raw?: string;
}

export interface Needle2Module {
  run(input: { text: string; context: unknown; tools: unknown[] }): Promise<Needle2RunOutput>;
  memoryBytes?(): number | undefined;
  dispose?(): void;
}

export type Needle2Factory = (config: { tools: unknown[] }) => Needle2Module | Promise<Needle2Module>;

export interface Needle2EngineOptions {
  module?: Needle2Factory;
  url?: string;
  ramBudgetBytes?: number;
  onError?: (message: string) => void;
}

const DEFAULT_RAM_BUDGET = 28 * 1024 * 1024;

export class Needle2Engine implements IntentEngine {
  private mod: Needle2Module | null = null;
  private tools: ToolSpec[] = [];
  private readonly ramBudgetBytes: number;

  constructor(private readonly opts: Needle2EngineOptions) {
    if (!opts.module && !opts.url) {
      throw new Error('Needle2Engine requires a `module` factory or a `url` pointing to the engine asset.');
    }
    this.ramBudgetBytes = opts.ramBudgetBytes ?? DEFAULT_RAM_BUDGET;
  }

  async load(): Promise<void> {
    if (this.mod) return;
    let factory: Needle2Factory | undefined = this.opts.module;
    if (!factory && this.opts.url) {
      const asset = await dynamicImport(this.opts.url);
      factory = asset.createNeedle2 as Needle2Factory | undefined;
    }
    if (typeof factory !== 'function') {
      throw new Error('Needle 2 asset does not export a createNeedle2(config) factory.');
    }
    const mod = await factory({ tools: this.tools });
    this.checkBudget(mod);
    this.mod = mod;
  }

  async parse(input: IntentInput): Promise<IntentResult> {
    const mod = this.mod;
    if (!mod) {
      return { kind: 'clarify', reason: 'The intent model is not loaded yet.', confidence: 0 };
    }
    this.tools = input.tools;
    const out = await mod.run({ text: input.text, context: input.context, tools: input.tools });
    this.checkBudget(mod);

    if (!out.action) {
      return {
        kind: 'unknown',
        reason: out.raw ? `model returned no action (raw: ${out.raw})` : 'model returned no action',
      };
    }
    const confidence = clamp01(out.confidence ?? (out.action ? 0.9 : 0));
    return { kind: 'execute', action: out.action, args: out.args ?? {}, confidence };
  }

  dispose(): void {
    this.mod?.dispose?.();
    this.mod = null;
  }

  private checkBudget(mod: Needle2Module): void {
    const used = mod.memoryBytes?.();
    if (used === undefined || used <= this.ramBudgetBytes) return;
    mod.dispose?.();
    if (this.mod === mod) this.mod = null;
    const message = `Needle 2 session exceeded its RAM budget (${String(used)} > ${String(this.ramBudgetBytes)} bytes) and was disposed.`;
    this.opts.onError?.(message);
    throw new Error(message);
  }
}

function dynamicImport(url: string): Promise<{ createNeedle2?: unknown }> {
  return import(/* @vite-ignore */ /* webpackIgnore: true */ url) as Promise<{ createNeedle2?: unknown }>;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
