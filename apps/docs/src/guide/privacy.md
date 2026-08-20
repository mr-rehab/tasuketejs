# Privacy

TasuketeJS makes no network requests and collects no data. This page states exactly what runs where.

## What stays on the device

- **Audio** — mic frames flow through an in-page `AudioWorklet` and the VAD segmenter; nothing is persisted, uploaded, or cached by the SDK.
- **Context** — context passed to the intent engine contains exactly what your `contextProvider` returns, frozen and size capped. The SDK adds nothing.
- **Actions & events** — all dispatch is in-memory and local to your app.
- **Telemetry** — there is none. The SDK makes zero network requests of its own.

## The one caveat: WebSpeech

`WebSpeechTranscriptSource` wraps the browser's `SpeechRecognition` API, and browser vendors decide how it processes audio. **In Chrome, recognition may use a cloud service.** The SDK cannot change that.

If your product must keep audio on the device:

```ts
import { MicSource, OfflineTranscriptSource } from '@tasuketejs/core';

const source = new OfflineTranscriptSource({
  frameSource: new MicSource(),
  stt: myLocalWasmEngine(), // local SttEngine, e.g. Whisper.cpp WASM
});
```

`OfflineTranscriptSource` keeps every stage local: capture, segmentation, and transcription. It is the fully offline path, at the cost of shipping a local STT model.

## Choosing a posture

| Posture | Source | Trade-off |
| --- | --- | --- |
| Convenience | `WebSpeechTranscriptSource` | No extra bytes shipped; audio may hit vendor cloud (Chrome). |
| Offline guarantee | `OfflineTranscriptSource` + local `SttEngine` | You ship a model (Whisper base is about 40MB); nothing leaves the device. |

Both plug into the same engine. Actions, gate, feedback, and events behave identically.

## Permission prompts

Mic access always goes through the browser's `getUserMedia` permission flow (or `SpeechRecognition`'s own). Denials surface as `mic-denied` error events rather than crashes. Pair them with a settings prompt. See [Events](/guide/events).
