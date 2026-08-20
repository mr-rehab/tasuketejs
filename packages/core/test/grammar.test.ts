import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { compileGrammar, UnsupportedGrammarError } from '../src/grammar.js';

describe('compileGrammar', () => {
  it('compiles an object with required and optional properties', () => {
    const grammar = compileGrammar(
      z.object({
        destination: z.string().describe('Target folder'),
        count: z.number().optional(),
        fallback: z.string().default('x'),
      }),
    );
    expect(grammar).toEqual({
      type: 'object',
      description: undefined,
      properties: {
        destination: { type: 'string', description: 'Target folder' },
        count: { type: 'optional', inner: { type: 'number' } },
        fallback: { type: 'string' },
      },
      required: ['destination'],
      additionalProperties: false,
    });
    expect(grammar.type === 'object' && grammar.properties.count.type).toBe('optional');
  });

  it('compiles string constraints', () => {
    const grammar = compileGrammar(z.string().min(2).max(10));
    expect(grammar).toEqual({ type: 'string', minLength: 2, maxLength: 10 });
  });

  it('compiles number constraints including int', () => {
    const grammar = compileGrammar(z.number().int().min(0).max(100));
    expect(grammar).toEqual({ type: 'number', minimum: 0, maximum: 100, integer: true });
  });

  it('compiles booleans, dates, enums, and literals', () => {
    expect(compileGrammar(z.boolean())).toEqual({ type: 'boolean' });
    expect(compileGrammar(z.date()).type).toBe('string');
    expect(compileGrammar(z.enum(['red', 'green']))).toEqual({ type: 'string', enum: ['red', 'green'] });
    expect(compileGrammar(z.literal('yes'))).toEqual({ type: 'string', enum: ['yes'] });
    expect(compileGrammar(z.literal(7))).toEqual({ type: 'number', minimum: 7, maximum: 7 });
  });

  it('compiles arrays with item grammar and bounds', () => {
    const grammar = compileGrammar(z.array(z.enum(['a', 'b'])).min(1).max(5));
    expect(grammar).toEqual({
      type: 'array',
      items: { type: 'string', enum: ['a', 'b'] },
      minItems: 1,
      maxItems: 5,
    });
  });

  it('compiles unions and nullable as union with null', () => {
    const union = compileGrammar(z.union([z.string(), z.number()]));
    expect(union).toEqual({ type: 'union', variants: [{ type: 'string' }, { type: 'number' }] });

    const nullable = compileGrammar(z.string().nullable());
    expect(nullable).toEqual({ type: 'union', variants: [{ type: 'string' }, { type: 'null' }] });
  });

  it('compiles discriminated unions into a union of variants', () => {
    const grammar = compileGrammar(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('a'), x: z.number() }),
        z.object({ kind: z.literal('b'), y: z.string() }),
      ]),
    );
    expect(grammar.type).toBe('union');
    if (grammar.type === 'union') {
      expect(grammar.variants).toHaveLength(2);
      expect(grammar.variants.every((v) => v.type === 'object')).toBe(true);
    }
  });

  it('unwraps refinements (ZodEffects) to the structural type', () => {
    const grammar = compileGrammar(z.object({ a: z.string() }).refine((v) => v.a.length > 0));
    expect(grammar.type).toBe('object');
  });

  it('preserves descriptions on the object itself', () => {
    const grammar = compileGrammar(z.object({ a: z.string() }).describe('Move things'));
    expect(grammar.type === 'object' && grammar.description).toBe('Move things');
  });

  it('rejects unsupported schemas with a typed error', () => {
    expect(() => compileGrammar(z.record(z.string(), z.string()))).toThrow(UnsupportedGrammarError);
    expect(() => compileGrammar(z.any())).toThrow(UnsupportedGrammarError);
  });
});
