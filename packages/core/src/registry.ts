import type { z } from 'zod';
import { compileGrammar, type GrammarConstraint } from './grammar.js';
import type { ContextSnapshot } from './context.js';

export interface ActionDefinition<TSchema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: TSchema;
  handler: (args: z.output<TSchema>, context: ContextSnapshot) => string | Promise<string>;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: GrammarConstraint;
}

const ACTION_NAME_RE = /^[a-z][a-z0-9_]{2,63}$/;

export class ArgsValidationError extends Error {
  constructor(
    readonly action: string,
    readonly issues: string[],
  ) {
    super(`Invalid arguments for "${action}": ${issues.join('; ')}`);
    this.name = 'ArgsValidationError';
  }
}

interface RegistryEntry {
  def: ActionDefinition;
  tool: ToolSpec;
}

export class ActionRegistry {
  private readonly actions = new Map<string, RegistryEntry>();

  register<TSchema extends z.ZodType>(def: ActionDefinition<TSchema>): () => void {
    if (typeof def.name !== 'string' || !ACTION_NAME_RE.test(def.name)) {
      throw new Error(`Invalid action name "${def.name}": must be snake_case matching /${ACTION_NAME_RE.source}/.`);
    }
    if (typeof def.handler !== 'function') {
      throw new Error(`Action "${def.name}": handler must be a function.`);
    }
    if (typeof def.description !== 'string' || !def.description.trim()) {
      throw new Error(`Action "${def.name}": description is required — it is the voice hint.`);
    }
    if (this.actions.has(def.name)) {
      throw new Error(`Action "${def.name}" is already registered.`);
    }
    const tool: ToolSpec = {
      name: def.name,
      description: def.description.trim(),
      parameters: compileGrammar(def.schema),
    };
    this.actions.set(def.name, { def: def as unknown as ActionDefinition, tool });
    return () => {
      this.actions.delete(def.name);
    };
  }

  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name)?.def;
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  get size(): number {
    return this.actions.size;
  }

  toolSpecs(): ToolSpec[] {
    return [...this.actions.values()].map((entry) => entry.tool);
  }

  async dispatch(name: string, args: unknown, context: ContextSnapshot): Promise<string> {
    const entry = this.actions.get(name);
    if (!entry) throw new Error(`Unknown action "${name}".`);
    const parsed = entry.def.schema.safeParse(args);
    if (!parsed.success) {
      throw new ArgsValidationError(
        name,
        parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      );
    }
    const result = await entry.def.handler(parsed.data as never, context);
    if (typeof result !== 'string' || !result.trim()) {
      throw new Error(`Action "${name}" handler must return a non-empty announcement string.`);
    }
    return result;
  }
}
