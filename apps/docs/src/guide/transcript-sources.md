# Transcript Sources

A transcript source turns microphone audio into text and pushes utterances into the engine. TasuketeJS ships two sources: one with no dependencies, one that works offline. The `TranscriptSource` interface has three methods, so custom sources are easy to write.

```ts
interface TranscriptSource {
  start(callbacks: {
    onUtterance(text: string): void;
    onError(code: TasuketeErrorCode, detail?: string): void;
  }): Promise<void>;
  stop(): Promise<void>;
}
```

## WebSpeechTranscriptSource

Built on the browser-native `SpeechRecognition` API. No extra bytes, no audio pipeline to manage.

```ts
import { WebSpeechTranscriptSource } from '@tasuketejs/core';

if (!WebSpeechTranscriptSource.supported) {
  // fall back to a text input UI
}

const source = new WebSpeechTranscriptSource({ lang: 'en-US' });
```

- `WebSpeechTranscriptSource.supported` — static feature detection.
- Continuous listening with automatic restart on the browser's end-of-session events; only finalized results are forwarded.
- Mic permission denial surfaces as an `error` event with code `mic-denied`.

::: warning Privacy caveat
In Chrome, `SpeechRecognition` audio may be processed by a **cloud service**. If your product must keep audio on the device, use `OfflineTranscriptSource` below.
:::

## OfflineTranscriptSource

The fully local pipeline: mic frames → VAD segmentation → your local `SttEngine`. Nothing leaves the device.

```ts
import { MicSource, OfflineTranscriptSource } from '@tasuketejs/core';
import { createWhisperEngine } from './my-whisper-wasm-binding'; // you bring this

const source = new OfflineTranscriptSource({
  frameSource: new MicSource(),            // AudioWorklet 16kHz framer
  stt: createWhisperEngine(),              // your SttEngine (e.g. Whisper.cpp WASM)
  sampleRate: 16000,
  vad: { startFrames: 8, hangoverFrames: 24 }, // tune speech segmentation
});
```

The pieces, all exported and reusable on their own:

| Export | Role |
| --- | --- |
| `MicSource` | `getUserMedia` → `AudioWorklet` framer producing `Float32Array` frames at 16kHz. Throws `MicPermissionError` on denial. |
| `SpeechSegmenter` / `rms` | Energy-based VAD that buffers frames into complete speech segments (pre-roll, hangover, max-duration flush). |
| `SttEngine` | The plug point: `transcribe(segment: Float32Array, sampleRate: number) => Promise<string>`. Wrap any local WASM model — Whisper.cpp compiled to WASM is the reference choice. |

This is also the path for React Native: provide a `FrameSource` backed by your native audio capture and an `SttEngine` backed by a local model; everything else stays identical.

## Text-only integrations

You can skip audio entirely and drive the same intent pipeline from a text box, useful for accessibility testing and silent environments. Construct the engine with any source (it never needs to start) and feed text directly:

```ts
const engine = new TasuketeEngine({
  contextProvider: () => ({}),
  transcriptSource: new WebSpeechTranscriptSource(), // never started
});

inputForm.addEventListener('submit', () => {
  void engine.processUtterance(inputEl.value); // same pipeline, same guarantees
});
```

`processUtterance` enqueues text exactly as if it had been spoken: transcript event, intent parse, gate, dispatch, feedback.
