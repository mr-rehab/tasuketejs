# Privacy

TasuketeJS is built privacy-first: voice interaction without a data bill.

## What stays on the device

- **Audio** — mic frames flow through an in-page `AudioWorklet` and the VAD segmenter; nothing is persisted, uploaded, or cached by the SDK.
- **Context** — intent-engine context contains exactly what your `contextProvider` returns, deep-frozen and byte-capped. The SDK adds nothing.
- **Actions & events** — all dispatch is in-memory and local to your app.
- **Telemetry** — there is none. The SDK makes zero network requests of its own.

## The one caveat: WebSpeech

`WebSpeechTranscriptSource` wraps the browser's `SpeechRecognition` API, and browser vendors decide how it processes audio. **In Chrome, recognition may use a cloud service.** The SDK cannot change that — it can only be honest about it.

If your product promises on-device processing:

```ts
import { MicSource, OfflineTranscriptSource } from '@tasuketejs/core';

const source = new OfflineTranscriptSource({
  frameSource: new MicSource(),
  stt: myLocalWhasmEngine(), // local SttEngine, e.g. Whisper.cpp WASM
});
```

`OfflineTranscriptSource` keeps every stage local: capture, segmentation, and transcription. It is the guaranteed-offline path, at the cost of shipping a local STT model.

## Choosing a posture

| Posture | Source | Trade-off |
| --- | --- | --- |
| Convenience | `WebSpeechTranscriptSource` | Zero bytes shipped; audio may hit vendor cloud (Chrome). |
| On-device guarantee | `OfflineTranscriptSource` + local `SttEngine` | You ship a model (~40MB-class for Whisper base); nothing ever leaves. |

Both plug into the same engine — actions, gate, feedback, and events behave identically.

## Permission prompts

Mic access always goes through the browser's `getUserMedia` permission flow (or `SpeechRecognition`'s own). Denials surface as `mic-denied` error events rather than crashes — pair them with a settings prompt. See [Events](/guide/events).
