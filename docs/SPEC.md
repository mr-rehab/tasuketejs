# TasuketeJS — Specification

**Local Voice AI accessibility SDK.** Tiny-footprint, 100% offline intent-driven voice control for PWAs and mobile apps.

TasuketeJS (助けて — "help me") decouples intent-to-action translation from fragile UI-bound trees (DOM, native a11y nodes) and anchors it to a local, service-level registry. Result: bulletproof, low-latency, privacy-first voice control with zero network calls.

---

## 1. Design Principles

1. **100% local** — no audio or text ever leaves the device.
2. **Intent over UI** — voice commands execute service-layer methods, never scrape the view tree.
3. **Tiny footprint** — ~14MB model binary, ~28MB RAM session; ships alongside an existing PWA/mobile app.
4. **No push-to-talk** — Silero VAD detects natural speech boundaries on the ambient mic stream.
5. **Deterministic safety** — low-confidence intents are suppressed; the SDK asks for clarification instead of guessing.
6. **Closed feedback loop** — every action returns a semantic string announced via OS screen-reader hooks or local edge TTS.

## 2. Technology Stack

| Component | Technology | Notes |
|---|---|---|
| Voice Activity Detection | Silero VAD (WASM) | Monitors local audio stream buffers; natural speech-boundary detection |
| Speech-to-Text | Whisper.cpp (WASM) | Raw audio frames → unstructured natural language |
| Intent Parsing | Needle 2 SLM Engine | 45M-param edge tool-calling model, 14MB binary, CQ2-bit quantization, 28MB RAM session, >100 tokens/sec |
| Grammar Constraint | Byte-level | Needle 2 emits structured JSON under grammar constraints derived from Zod schemas |
| Schema Validation | Zod (runtime) | Compiles execution grammars dynamically; no experimental TS decorators or metadata reflection |

## 3. Architecture

```
[ Ambient Mic Input ]
        │
        ▼
[ Silero VAD (WASM) ] ──(audio chunk)──► [ Whisper.cpp STT (WASM) ]
        │                                        │
        │                                  (raw text)
        │                                        ▼
        │        [ State Context Provider ] ──► [ Needle 2 Engine ]
        │        (Zustand/Redux store snapshot)   + grammar constraint
        │                                           │
        │                                     (structured JSON)
        │                                           ▼
        │                              [ Confidence Gate ]
        │                              (threshold → execute | clarify)
        │                                           │
        ▼                                           ▼
[ Accessibility Feedback Dispatcher ] ◄── [ Local Service Registry ]
(OS screen reader hook / Edge TTS)        (executes registered handler)
```

### 3.1 Context-Aware Resolution
Before text reaches Needle 2, the SDK pulls an isolated, serialized snapshot of frontend state (active item arrays, current route, selected IDs) via the app-provided `contextProvider` and injects it into the evaluation payload. This resolves context-blind utterances like *"move these files"* — "these" is resolved from state, not guessed.

### 3.2 Deterministic Execution & Fallback Routing
Needle 2 has a calibrated confidence scoring head. If input confidence falls below threshold, the SDK suppresses execution and emits an explicit **clarification event**. Erroneous actions are never risked.

### 3.3 Closed Feedback Loop
Service-layer execution bypasses the UI, so feedback must be explicit. Every registered action's handler returns a semantic string; the SDK broadcasts it immediately via `AccessibilityInfo.announceForAccessibility` (React Native) or local edge TTS (web/PWA).

## 4. Public API

```typescript
import { TasuketeEngine } from '@tasuketejs/core';
import { z } from 'zod';

const tasukete = new TasuketeEngine({
  contextProvider: () => ({
    activeDirectory: useFileStore.getState().currentPath,
    selectedFileIds: useFileStore.getState().selectedIds,
  }),
});

tasukete.registerAction({
  name: 'migrate_files',
  description: 'Move selected files to a target destination folder',
  schema: z.object({
    destination: z.string().describe('Target folder name or path ID'),
  }),
  handler: async (args, context) => {
    const fileIds = context.selectedFileIds;
    if (fileIds.length === 0) return 'No files are currently selected.';
    await fileDatabaseService.moveBatch(fileIds, args.destination);
    return `Successfully moved ${fileIds.length} items to ${args.destination}.`;
  },
});

tasukete.start(); // begins local audio stream listener loop
```

### API Surface

| Member | Purpose |
|---|---|
| `new TasuketeEngine({ contextProvider, confidenceThreshold? })` | Construct engine; bind app state snapshot provider |
| `registerAction({ name, description, schema, handler })` | Register a service-layer action; Zod schema auto-compiles to Needle 2 grammar |
| `start()` / `stop()` | Start/stop mic listener loop (requests permission on web) |
| `on('transcript' \| 'clarify' \| 'action' \| 'error', cb)` | Event subscription for UI/debug affordances |
| `tasukete.context` | Last serialized state snapshot (read-only) |

### Handler Contract
- `handler(args, context)` → `string | Promise<string>`
- `args` — parsed, Zod-validated parameters
- `context` — serialized snapshot from `contextProvider` at utterance time
- Return string **must** be human-readable; it is announced to the user.

## 5. Distribution

Open-source **monorepo**:

| Package | Contents |
|---|---|
| `@tasuketejs/core` | Engine, registry, context provider, grammar compiler, event bus |
| `@tasuketejs/react` | React/PWA bindings (hook: `useTasukete`) |
| `@tasuketejs/react-native` | RN bindings (screen-reader announcement adapter) |
| `apps/reference-file-manager` | Fully functional reference app (local file management dashboard) proving zero-latency WASM execution, context-state binding, and hardware safety gating under real conditions |

No generic package ships prematurely — the reference app proves production viability first.

## 6. Non-Goals

- Cloud/hybrid STT or LLM fallbacks.
- UI-tree scraping or DOM-locator-based command binding.
- Wake-word engines (VAD speech-boundary detection is the trigger model).
- Multi-language intent models in v1 (architecture permits; not in scope).
