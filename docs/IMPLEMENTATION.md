# TasuketeJS — Implementation Spec

Companion to [SPEC.md](./SPEC.md). Defines repo layout, module contracts, build pipeline, milestones, and acceptance criteria.

---

## 1. Monorepo Layout

```
tasuketejs/
├── docs/                          # SPEC.md, IMPLEMENTATION.md
├── packages/
│   ├── core/                      # @tasuketejs/core
│   │   ├── src/
│   │   │   ├── engine.ts          # TasuketeEngine — orchestrator
│   │   │   ├── registry.ts        # action registry + Zod→grammar compiler
│   │   │   ├── context.ts         # state snapshot provider + serializer
│   │   │   ├── audio/
│   │   │   │   ├── mic-source.ts  # getUserMedia / RN audio stream
│   │   │   │   ├── vad.ts         # Silero VAD WASM wrapper (speech segments)
│   │   │   │   └── stt.ts         # Whisper.cpp WASM wrapper (segment → text)
│   │   │   ├── needle/
│   │   │   │   ├── engine.ts      # Needle 2 inference session mgmt (28MB budget)
│   │   │   │   └── grammar.ts     # Zod schema → byte-level grammar constraint
│   │   │   ├── gate.ts            # confidence gate → execute | clarify
│   │   │   ├── feedback.ts        # announce: RN AccessibilityInfo | WebTTS
│   │   │   └── events.ts          # typed event bus (transcript/clarify/action/error)
│   │   └── assets/                # model + wasm binaries (see §3)
│   ├── react/                     # @tasuketejs/react — useTasukete hook
│   └── react-native/              # @tasuketejs/react-native — RN adapter
├── apps/
│   └── reference-file-manager/    # proof-of-viability app (Zustand store)
└── tooling/                       # shared tsconfig, eslint, build scripts
```

**Tooling:** pnpm workspaces + turborepo. TypeScript strict. Vitest. No `experimentalDecorators`, no `reflect-metadata`.

## 2. Core Contracts

```typescript
// registry.ts
interface ActionDefinition<TSchema extends z.ZodType> {
  name: string;                       // stable, snake_case tool name for Needle 2
  description: string;                // fed to model as tool description
  schema: TSchema;                    // Zod; .describe() fields become param docs
  handler: (args: z.output<TSchema>, context: ContextSnapshot) => Promise<string>;
}

// context.ts
type ContextProvider = () => Record<string, unknown>;
type ContextSnapshot = Readonly<Record<string, unknown>>;  // JSON-serializable, size-capped

// needle/grammar.ts
compileGrammar(schema: z.ZodType): GrammarConstraint;       // byte-level, cached per action

// gate.ts
type GateResult =
  | { kind: 'execute'; action: string; args: unknown; confidence: number }
  | { kind: 'clarify'; reason: string };                    // suppressed below threshold

// events.ts
type TasuketeEvents = {
  transcript: { text: string };
  action: { name: string; args: unknown; result: string; confidence: number };
  clarify: { reason: string; confidence: number; text: string };
  error: {
    code:
      | 'mic-denied'
      | 'model-load'
      | 'intent-failed'
      | 'handler-failed'
      | 'stt-failed'
      | 'unsupported'
      | 'registration';
    detail?: string;
  };
};
```

### Pipeline Invariants
1. **Snapshot isolation** — `contextProvider()` runs once per utterance, after VAD end-of-speech; handlers receive the same frozen snapshot the model saw.
2. **Validate before execute** — model JSON output passes Zod parse; failure routes to `clarify`, never executes.
3. **Handler return announced** — engine awaits handler, broadcasts result string via `feedback.ts` regardless of action success.
4. **Snapshot size cap** — context snapshot serialized and truncated (default 8KB) to protect the 28MB RAM budget.
5. **Serial execution** — one intent in flight at a time; VAD segments during execution are queued, not dropped.

## 3. Asset & Build Pipeline

| Asset | Size (target) | Loading |
|---|---|---|
| Needle 2 binary (CQ2-bit quantized) | 14MB | Lazy — fetched on `start()`, cached (Cache Storage / RN asset) |
| Silero VAD WASM | ~2MB | Eager on `start()` |
| Whisper.cpp WASM (base model) | ~40MB | Lazy — fetched on `start()` |
| Grammar cache | KB-scale | Compiled at `registerAction`, in-memory |

- **Web/PWA:** assets served from package CDN path or self-hosted (default: self-hosted — no third-party origin). Use `WebAssembly.instantiateStreaming`; require `crossOriginIsolated` check with graceful fallback message for SharedArrayBuffer requirements.
- **React Native:** assets bundled via platform asset system; WASM executed via JSI/WASM runtime where available, else vendor-compiled native modules behind the same TS interface.
- **Versioning:** asset manifest (`assets/manifest.json`) pins binary hashes; core refuses mismatched manifest/model pairs.

## 4. Milestones

### M1 — Audio spine (core)
Mic source → Silero VAD → speech segment boundaries.
**Done when:** VAD emits correct start/end speech segments on live mic in reference app; `transcript` placeholder events fire per segment.

### M2 — Transcription
Whisper.cpp WASM wired; segment → text.
**Done when:** end-to-end raw text with median < 1.5s per utterance on mid-range hardware; `transcript` events carry real text.

### M3 — Intent engine + grammar
Needle 2 session (28MB budget enforced), Zod→grammar compiler, confidence gate.
**Done when:** registered actions parse correctly; sub-threshold inputs produce `clarify`; invalid model JSON never reaches handlers.

### M4 — Execution + feedback loop
Registry dispatch, context snapshot isolation, feedback dispatcher (Web Speech Synthesis + RN `announceForAccessibility`).
**Done when:** the SPEC.md `migrate_files` example works verbatim in the reference app, with spoken/announced result.

### M5 — Packages & reference app
`@tasuketejs/react` (`useTasukete`), `@tasuketejs/react-native`, public reference file-manager app.
**Done when:** reference app installable as PWA; README-driven run from clean clone; published workspace docs.

## 5. Acceptance Criteria (project-level)

- [ ] 100% offline: no network calls after asset load (verified by test-suite network block).
- [ ] RAM session ≤ 28MB steady-state during inference (instrumented).
- [ ] Median utterance→announcement latency < 2.5s on mid-range hardware.
- [ ] Zero executions of sub-threshold intents (property test with adversarial transcripts).
- [ ] Bundle impact on host app: `@tasuketejs/core` JS ≤ 50KB gzip excluding lazy assets.

## 6. Testing Strategy

- **Unit:** grammar compiler (Zod → grammar, per-type matrix), gate thresholds, context cap.
- **Integration:** fake mic (audio fixture) → VAD → STT stub → engine → handler; assert snapshot isolation and serial execution.
- **E2E (reference app):** scripted utterances against real binaries — happy path, ambiguity ("move these" with/without selection), unknown intent, mic permission denied.
- **Hardware matrix:** low/mid Android, mid iOS, desktop Chrome/Safari.

## 7. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Needle 2 accuracy on paraphrased commands | Ship prompt/tool-description guide; `clarify` path is safe default; reference app demonstrates description best practices |
| Whisper.cpp WASM cold-load cost on RN | Bundle-as-asset strategy (§3); progress events for first-load UX |
| SharedArrayBuffer / COOP-COEP requirements on web | Runtime capability detection + clear setup docs; single-thread fallback mode |
| Context snapshot leaking sensitive state | Provider is explicit allowlist by construction; document "never put secrets in contextProvider" |
| 28MB budget exceeded under load | Instrumented session; snapshot cap; grammar cache eviction is explicit |
