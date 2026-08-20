import { z } from 'zod';

export type GrammarConstraint =
  | { type: 'object'; description?: string; properties: Record<string, GrammarConstraint>; required: string[]; additionalProperties: false }
  | { type: 'string'; description?: string; enum?: string[]; minLength?: number; maxLength?: number }
  | { type: 'number'; description?: string; minimum?: number; maximum?: number; integer?: boolean }
  | { type: 'boolean'; description?: string }
  | { type: 'array'; description?: string; items: GrammarConstraint; minItems?: number; maxItems?: number }
  | { type: 'union'; description?: string; variants: GrammarConstraint[] }
  | { type: 'optional'; inner: GrammarConstraint }
  | { type: 'null' };

export class UnsupportedGrammarError extends Error {
  constructor(readonly typeName: string) {
    super(`Unsupported Zod schema for grammar compilation: ${typeName}`);
    this.name = 'UnsupportedGrammarError';
  }
}

export function compileGrammar(schema: z.ZodType): GrammarConstraint {
  return walk(schema as z.ZodTypeAny);
}

interface BoundsCheck {
  kind: string;
  value: number;
}
type LengthBound = { value: number } | null;

function walk(schema: z.ZodTypeAny): GrammarConstraint {
  return (
    walkLeaf(schema) ??
    walkWrapper(schema) ??
    walkObject(schema) ??
    walkUnion(schema) ??
    throwUnsupported(schema)
  );
}

function walkLeaf(schema: z.ZodTypeAny): GrammarConstraint | null {
  if (schema instanceof z.ZodString) return walkStringChecks(schema);
  if (schema instanceof z.ZodNumber) return walkNumberChecks(schema);
  if (schema instanceof z.ZodBoolean) return describe({ type: 'boolean' }, descriptionOf(schema));
  if (schema instanceof z.ZodBigInt) return describe({ type: 'number', integer: true }, descriptionOf(schema));
  if (schema instanceof z.ZodDate) {
    return describe({ type: 'string', description: 'ISO 8601 date-time string' }, descriptionOf(schema));
  }
  if (schema instanceof z.ZodLiteral) return walkLiteral(schema);
  if (schema instanceof z.ZodEnum || schema instanceof z.ZodNativeEnum) return walkEnumValues(schema);
  return null;
}

function walkStringChecks(schema: z.ZodString): GrammarConstraint {
  const node: GrammarConstraint = { type: 'string' };
  for (const check of schema._def.checks as BoundsCheck[]) {
    if (check.kind === 'min') node.minLength = check.value;
    else if (check.kind === 'max') node.maxLength = check.value;
  }
  return describe(node, descriptionOf(schema));
}

function walkNumberChecks(schema: z.ZodNumber): GrammarConstraint {
  const node: GrammarConstraint = { type: 'number' };
  for (const check of schema._def.checks as BoundsCheck[]) {
    if (check.kind === 'min') node.minimum = check.value;
    else if (check.kind === 'max') node.maximum = check.value;
    else if (check.kind === 'int') node.integer = true;
  }
  return describe(node, descriptionOf(schema));
}

function walkEnumValues(schema: z.ZodTypeAny): GrammarConstraint {
  const raw = Object.values((schema._def as { values: Record<string, unknown> }).values);
  const values = raw.filter((v): v is string => typeof v === 'string');
  return describe({ type: 'string', enum: values }, descriptionOf(schema));
}

function walkLiteral(schema: z.ZodTypeAny): GrammarConstraint {
  const value = (schema._def as { value: unknown }).value;
  const description = descriptionOf(schema);
  if (typeof value === 'string') return describe({ type: 'string', enum: [value] }, description);
  if (typeof value === 'number') return describe({ type: 'number', minimum: value, maximum: value }, description);
  return describe({ type: 'boolean' }, description);
}

function walkWrapper(schema: z.ZodTypeAny): GrammarConstraint | null {
  if (schema instanceof z.ZodArray) {
    const def = schema._def as unknown as {
      type: z.ZodTypeAny;
      minLength: LengthBound;
      maxLength: LengthBound;
      exactLength: LengthBound;
    };
    const node: GrammarConstraint = { type: 'array', items: walk(def.type) };
    if (def.exactLength) {
      node.minItems = def.exactLength.value;
      node.maxItems = def.exactLength.value;
    } else {
      if (def.minLength) node.minItems = def.minLength.value;
      if (def.maxLength) node.maxItems = def.maxLength.value;
    }
    return describe(node, descriptionOf(schema));
  }
  if (schema instanceof z.ZodOptional) {
    return { type: 'optional', inner: walk(schema._def.innerType as z.ZodTypeAny) };
  }
  if (schema instanceof z.ZodNullable) {
    const variants = [walk(schema._def.innerType as z.ZodTypeAny), { type: 'null' } as GrammarConstraint];
    return describe({ type: 'union', variants }, descriptionOf(schema));
  }
  if (schema instanceof z.ZodDefault) {
    return walk(schema._def.innerType as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodEffects) {
    // Refinements run at parse time; grammar only needs the structural type.
    return walk(schema._def.schema as z.ZodTypeAny);
  }
  return null;
}

function walkObject(schema: z.ZodTypeAny): GrammarConstraint | null {
  if (!(schema instanceof z.ZodObject)) return null;
  const shape = schema.shape as z.ZodRawShape;
  const properties: Record<string, GrammarConstraint> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    properties[key] = walk(value);
    if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) required.push(key);
  }
  return describe({ type: 'object', properties, required, additionalProperties: false }, descriptionOf(schema));
}

function walkUnion(schema: z.ZodTypeAny): GrammarConstraint | null {
  if (!(schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion)) return null;
  const options = (schema._def as { options?: z.ZodTypeAny[] }).options ?? [];
  const variants = options.map((option) => walk(option));
  if (variants.length === 0) throw new UnsupportedGrammarError(typeNameOf(schema));
  if (variants.length === 1) return variants[0];
  return describe({ type: 'union', variants }, descriptionOf(schema));
}

function throwUnsupported(schema: z.ZodTypeAny): never {
  throw new UnsupportedGrammarError(typeNameOf(schema));
}

function typeNameOf(schema: z.ZodTypeAny): string {
  return (schema._def as { typeName?: string }).typeName ?? schema.constructor.name;
}

function descriptionOf(schema: z.ZodTypeAny): string | undefined {
  return schema.description;
}

function describe<T extends GrammarConstraint>(node: T, description: string | undefined): T {
  if (description) (node as { description?: string }).description = description;
  return node;
}
