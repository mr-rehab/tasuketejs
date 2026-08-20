# TasuketeJS

Intent-driven, 100% client-side voice accessibility for PWAs and mobile apps.

Users speak. TasuketeJS transcribes, matches the utterance to one of your registered **actions**, validates the arguments with [Zod](https://zod.dev), and speaks the result back. It never scrapes your UI tree — your app exposes typed actions, the voice layer does the rest.

```
mic → transcript source → intent engine → confidence gate → your handler → spoken feedback
```

## Why TasuketeJS

- **Intent-driven, not UI-driven** — actions are declared, typed, and validated. No fragile DOM heuristics.
- **100% client-side** — no SDK-mandated network calls, no telemetry. A guaranteed-offline pipeline is built in.
- **Framework-agnostic** — plain TypeScript; use it from React, Vue, Svelte, Solid, or React Native.
- **Safe by default** — a confidence gate suppresses uncertain speech into clarification questions instead of running the wrong action.
- **Tiny footprint** — the default engine is deterministic and dependency-free; the optional edge-SLM path runs inside an enforced 28MB RAM budget.

## Install

```bash
pnpm add @tasuketejs/core zod   # zod v3 (>=3.22 <4) is a peer dependency
```

## Usage

```ts
import { z } from 'zod';
import { TasuketeEngine, WebSpeechTranscriptSource } from '@tasuketejs/core';

const engine = new TasuketeEngine({
  contextProvider: () => ({ selectedFiles: ['invoice.pdf'] }),
  transcriptSource: new WebSpeechTranscriptSource({ lang: 'en-US' }),
});

engine.registerAction({
  name: 'delete_file',
  description: 'Delete a file by name',
  schema: z.object({ name: z.string() }),
  handler: (args) => `Deleted ${args.name}.`, // spoken back to the user
});

engine.on('action', ({ name, args }) => console.log('ran', name, args));
await engine.start();
```

Unclear speech never guesses — the user hears a clarification question and a `clarify` event fires.

## Documentation

The full documentation lives in [`apps/docs`](apps/docs) and covers actions, context snapshots, transcript sources (including the guaranteed-offline pipeline), intent engines, events, and privacy:

```bash
pnpm docs:dev    # local docs site
pnpm docs:build  # regenerate API reference (TypeDoc) + build the site
```

## Repository

```
packages/core   @tasuketejs/core — engine, registry, grammar compiler, intent
                engines, confidence gate, transcript sources, audio spine
apps/docs       documentation site (VitePress + TypeDoc)
docs/           specification and implementation plan
```

## Development

```bash
pnpm install
pnpm test        # 63 tests
pnpm lint        # strict typescript-eslint + sonarjs, zero warnings
pnpm typecheck
pnpm build       # ESM + CJS + .d.ts for every package
```

Pre-commit runs lint-staged with the same strict ESLint configuration on every change.

### SonarQube audit

A local SonarQube static audit is wired up via Docker:

```bash
./scripts/sonar-audit.sh --server   # first run: start SonarQube, log in, create a token
export SONAR_TOKEN=<token>
./scripts/sonar-audit.sh            # boots SonarQube, runs tests with coverage, scans
```

The dashboard lands at `http://localhost:9000/dashboard?id=tasuketejs`. Configuration lives in `sonar-project.properties`; `sonarjs` lint rules also run on every commit in the meantime.
