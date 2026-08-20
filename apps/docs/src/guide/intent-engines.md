# Intent Engines & Confidence

The intent engine maps an utterance plus context plus the registered tool specs to one of three outcomes:

```ts
type IntentResult =
  | { kind: 'execute'; action: string; args: unknown; confidence: number }
  | { kind: 'clarify'; reason: string; confidence: number }
  | { kind: 'unknown'; reason: string };
```

## HeuristicIntentEngine (default)

Deterministic, zero-dependency, instant. It scores each registered action against the spoken words:

- name tokens (`move_file` → `move`, `file`) carry the most weight, including partial matches on longer words
- every word matched in the action `description` adds a little more
- spoken parameter names add further signal
- near-tied top candidates halve the confidence — ambiguity is surfaced, not guessed

```ts
import { HeuristicIntentEngine, TasuketeEngine } from '@tasuketejs/core';

const engine = new TasuketeEngine({
  // ...
  intentEngine: new HeuristicIntentEngine({ minToolScore: 1 }),
});
```

It is deliberately simple — and always available with no downloads. For production accuracy, bring the edge model.

## Needle2Engine (edge SLM)

`Needle2Engine` adapts the "Needle 2" small language model (~45M params, quantized to roughly 14MB on disk / 28MB RAM). The binary is **not** bundled — you provide it as a module factory or a URL:

```ts
import { Needle2Engine, TasuketeEngine } from '@tasuketejs/core';

const engine = new TasuketeEngine({
  // ...
  intentEngine: new Needle2Engine({
    url: '/assets/needle2/index.js',          // or module: createNeedle2
    ramBudgetBytes: 28 * 1024 * 1024,          // enforced, not advisory
    onError: (message) => telemetry.count('needle2', message),
  }),
});
```

- The asset must export `createNeedle2(config)` returning `{ run(input), memoryBytes?(), dispose?() }`.
- `load()` runs on `engine.start()`; if memory reporting exceeds the budget the engine disposes the module and reports via `onError` — the RAM ceiling is enforced, not hoped for.
- Output maps cleanly onto `IntentResult`; `confidence` comes from the model.

## The confidence gate

Between the intent engine and your handlers sits `ConfidenceGate`:

1. **Unknown** intents become a clarification ("I didn't catch an action in that") — the engine never silently ignores speech.
2. **Execute** intents below `confidenceThreshold` (default `0.6`) are suppressed into a clarify outcome.
3. Required parameters missing from the result — or failing schema validation — also clarify, quoting the parameter that is missing.

```ts
const engine = new TasuketeEngine({
  // ...
  confidenceThreshold: 0.7, // stricter; lower it to make the engine more adventurous
});
```

The user always hears *why* (via the feedback dispatcher), and every clarification is on the `clarify` event if you would rather render it as UI.

## Feedback

By default outcomes are spoken with `SpeechSynthesisFeedback` (auto-detected, with `lang`/`rate`/`pitch`/`voiceURI` options). Pass `feedback: null` to silence announcements entirely, or any object implementing `announce(text)` — for example one that renders captions in your own UI.
