# Events

Every meaningful moment in the voice pipeline is on a typed event bus. Subscribe with `engine.on` — it returns an unsubscribe function.

```ts
const off = engine.on('action', (event) => {
  console.log(event.name, event.args, event.result, event.confidence);
});
off(); // stop listening
```

Listener exceptions are contained: a broken listener can never break the voice pipeline.

## Events

| Event | Payload | When |
| --- | --- | --- |
| `transcript` | `{ text }` | A finalized utterance entered the pipeline. |
| `action` | `{ name, args, result, confidence }` | An action handler completed; `result` is the announcement string it returned. |
| `clarify` | `{ reason, confidence, text }` | The engine is asking the user a question instead of executing (low confidence, missing/invalid arguments, unknown intent). |
| `error` | `{ code, detail? }` | Any failure anywhere in the pipeline — always accompanied by user-facing handling (announcement or thrown promise from `start`). |

## Error codes

| Code | Meaning |
| --- | --- |
| `mic-denied` | Microphone permission was refused. |
| `model-load` | The intent engine's `load()` failed (e.g. missing Needle 2 asset). |
| `intent-failed` | The intent engine threw while parsing an utterance. |
| `handler-failed` | An action handler threw or returned an invalid result. |
| `stt-failed` | The transcript source failed mid-session. |
| `unsupported` | The environment lacks a required capability (e.g. no `SpeechRecognition`). |
| `registration` | `registerAction` rejected a definition (invalid name, duplicate, unsupported schema). |

## Patterns

**Render live captions** — mirror the pipeline for deaf and hard-of-hearing users:

```ts
engine.on('transcript', ({ text }) => captions.push({ kind: 'user', text }));
engine.on('action', ({ result }) => captions.push({ kind: 'system', text: result }));
engine.on('clarify', ({ reason }) => captions.push({ kind: 'system', text: reason }));
```

**Log and recover** — errors never reject outside `start()`; observe them where it matters:

```ts
engine.on('error', ({ code, detail }) => {
  if (code === 'mic-denied') showMicSettingsPrompt();
});
```

`destroy()` removes all listeners; individual `on` subscriptions should be cleaned up by whatever owns them (e.g. React effects).
