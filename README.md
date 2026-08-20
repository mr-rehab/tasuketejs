# TasuketeJS

Voice control for web and mobile apps, written in plain TypeScript.

Users speak. TasuketeJS transcribes, matches the utterance to one of your registered **actions**, validates the arguments with [Zod](https://zod.dev), and speaks the result back. It does not read your UI tree. Your app exposes typed actions; the voice layer does the rest.

```
mic → transcript source → intent engine → confidence gate → your handler → spoken feedback
```

## Design

- Actions are declared with a Zod schema. No DOM inspection.
- Everything runs in your app. No network calls, no telemetry. An offline pipeline is included.
- No framework dependency. Works with React, Vue, Svelte, Solid, and React Native.
- Speech below the confidence threshold produces a clarification question instead of running the wrong action.
- The default intent engine is deterministic with no dependencies. The optional SLM path is capped at 28MB RAM, enforced in code.

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

Unclear speech produces a clarification question and a `clarify` event instead of a guessed action.

## Documentation

Docs: **https://mr-rehab.github.io/tasuketejs/**. Covers actions, context snapshots, transcript sources (including the offline pipeline), intent engines, events, and privacy.

Source is in [`apps/docs`](apps/docs). A GitHub Actions workflow builds and deploys the site on every push to `main`:

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
