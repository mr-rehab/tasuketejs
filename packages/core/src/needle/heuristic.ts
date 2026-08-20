import type { GrammarConstraint } from '../grammar.js';
import type { ToolSpec } from '../registry.js';
import type { IntentEngine, IntentInput, IntentResult } from './types.js';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'these', 'those', 'this', 'that',
  'please', 'my', 'me', 'i', 'it', 'its', 'is', 'are', 'was', 'were', 'be', 'been', 'with', 'from',
  'into', 'at', 'by', 'up', 'down', 'out', 'want', 'would', 'like', 'can', 'could', 'you', 'will',
  'all', 'some', 'now', 'then', 'there', 'here', 'them', 'they', 'just', 'very',
]);

const NAME_TOKEN_WEIGHT = 3;
const PARTIAL_TOKEN_WEIGHT = 1.25;
const FULL_NAME_BONUS = 2;
const DESC_WORD_WEIGHT = 1;
const PARAM_WORD_WEIGHT = 1.5;
const CONFIDENCE_DIVISOR = 8;
const CONFIDENCE_CAP = 0.95;
const AMBIGUITY_MARGIN = 1;

export interface HeuristicIntentEngineOptions {
  minToolScore?: number;
}

/**
 * Deterministic, zero-dependency intent engine. It is the default fallback so the
 * SDK works without the Needle 2 binary; production accuracy comes from Needle2Engine.
 */
export class HeuristicIntentEngine implements IntentEngine {
  constructor(private readonly opts: HeuristicIntentEngineOptions = {}) {}

  parse(input: IntentInput): Promise<IntentResult> {
    return Promise.resolve(this.parseSync(input));
  }

  private parseSync({ text, tools }: IntentInput): IntentResult {
    const words = wordsOf(text);
    if (words.length === 0 || tools.length === 0) {
      return { kind: 'unknown', reason: 'nothing to match against' };
    }

    const scored = tools
      .map((tool) => ({ tool, score: scoreTool(tool, words) }))
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best.score < (this.opts.minToolScore ?? 1)) {
      return { kind: 'unknown', reason: `no action matches "${text}"` };
    }
    const second = scored[1]?.score ?? 0;

    let confidence = Math.min(CONFIDENCE_CAP, best.score / CONFIDENCE_DIVISOR);
    if (second > 0 && best.score - second < AMBIGUITY_MARGIN) confidence *= 0.5;

    const extraction = extractArgs(text, best.tool.parameters);
    if (extraction && !extraction.ok) {
      return {
        kind: 'clarify',
        reason: `I understood "${best.tool.name}", but I'm missing a value for "${extraction.missing}".`,
        confidence,
      };
    }
    const args = extraction?.ok ? extraction.args : {};
    return { kind: 'execute', action: best.tool.name, args, confidence };
  }
}

function wordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((w) => !STOPWORDS.has(w));
}

function paramKeys(grammar: GrammarConstraint): string[] {
  return grammar.type === 'object' ? Object.keys(grammar.properties) : [];
}

function scoreTool(tool: ToolSpec, words: string[]): number {
  const nameTokens = tool.name.split('_').filter((t) => t.length > 1);
  let score = 0;
  let matched = 0;

  for (const token of nameTokens) {
    if (words.includes(token)) {
      matched++;
      score += NAME_TOKEN_WEIGHT;
    } else if (token.length >= 4 && words.some((w) => w.length >= 4 && (w.startsWith(token) || token.startsWith(w)))) {
      matched++;
      score += PARTIAL_TOKEN_WEIGHT;
    }
  }
  if (nameTokens.length > 0 && matched === nameTokens.length) score += FULL_NAME_BONUS;

  const descWords = new Set((tool.description.toLowerCase().match(/[a-z0-9]+/g) ?? []));
  for (const word of words) {
    if (word.length >= 4 && !nameTokens.includes(word) && descWords.has(word)) score += DESC_WORD_WEIGHT;
  }

  for (const param of paramKeys(tool.parameters)) {
    if (words.includes(param)) score += PARAM_WORD_WEIGHT;
  }

  return score;
}

type Extraction = { ok: true; args: Record<string, unknown> } | { ok: false; missing: string };

function extractArgs(text: string, grammar: GrammarConstraint): Extraction | null {
  if (grammar.type !== 'object') return null;
  const quoted: string[] = [];
  const stripped = stripQuoted(text, quoted);
  const tokens = stripped.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  const spokenToParam = buildParamLookup(grammar);
  const args = extractNamedParams(tokens, spokenToParam, grammar.properties);
  fillQuotedParams(args, quoted, grammar.properties);
  for (const required of grammar.required) {
    if (!(required in args)) return { ok: false, missing: required };
  }
  return { ok: true, args };
}

function stripQuoted(text: string, quoted: string[]): string {
  return text.replace(/["“]([^"“”]*)["”]|'([^']*)'/g, (match, dq: string, sq: string) => {
    quoted.push((dq.length > 0 ? dq : sq).trim());
    return ' ';
  });
}

function buildParamLookup(grammar: Extract<GrammarConstraint, { type: 'object' }>): Map<string, string> {
  const spokenToParam = new Map<string, string>();
  for (const param of Object.keys(grammar.properties)) {
    spokenToParam.set(param.toLowerCase(), param);
    spokenToParam.set(param.replace(/_(.)/g, (_, c: string) => c.toUpperCase()).toLowerCase(), param);
  }
  return spokenToParam;
}

function extractNamedParams(
  tokens: string[],
  spokenToParam: Map<string, string>,
  props: Record<string, GrammarConstraint>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (let i = 0; i < tokens.length; i++) {
    const param = spokenToParam.get(tokens[i]);
    if (!param || param in args) continue;
    const value: string[] = [];
    for (let j = i + 1; j < tokens.length; j++) {
      if (spokenToParam.has(tokens[j])) break;
      value.push(tokens[j]);
    }
    const raw = value.join(' ').trim();
    if (raw) args[param] = coerce(raw, props[param]);
  }
  return args;
}

function fillQuotedParams(
  args: Record<string, unknown>,
  quoted: string[],
  props: Record<string, GrammarConstraint>,
): void {
  let quotedIndex = 0;
  for (const param of Object.keys(props)) {
    if (param in args || quotedIndex >= quoted.length) continue;
    args[param] = coerce(quoted[quotedIndex++], props[param]);
  }
}

function coerce(raw: string, grammar: GrammarConstraint): unknown {
  const value = raw.trim();
  if (grammar.type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value;
  }
  if (grammar.type === 'boolean') {
    if (/^(true|yes|on)$/i.test(value)) return true;
    if (/^(false|no|off)$/i.test(value)) return false;
    return value;
  }
  if (grammar.type === 'optional') return coerce(value, grammar.inner);
  if (grammar.type === 'string' && grammar.enum) {
    const hit = grammar.enum.find((option) => option.toLowerCase() === value.toLowerCase());
    return hit ?? value;
  }
  return value;
}
