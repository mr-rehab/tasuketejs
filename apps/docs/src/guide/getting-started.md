# Getting Started

TasuketeJS turns speech into typed handler calls. Your app registers **actions**: named operations with a Zod schema. Speech is transcribed, matched to an action, validated, and executed. The result is spoken back to the user. The SDK never reads your UI tree.

```
mic → transcript source → intent engine → confidence gate → your action handler → spoken feedback
```

## Requirements

- zod v3 (`>=3.22 <4`) — peer dependency, used for action schemas
- A browser environment for mic-based sources (`getUserMedia` or `SpeechRecognition`)

## Install

```bash
pnpm add @tasuketejs/core zod
# npm install @tasuketejs/core zod
# yarn add @tasuketejs/core zod
```

## Your first voice action

```ts
import { z } from 'zod';
import { TasuketeEngine, WebSpeechTranscriptSource } from '@tasuketejs/core';

const engine = new TasuketeEngine({
  // Runs once per utterance; its return value is what the intent engine "sees".
  contextProvider: () => ({
    selectedFiles: ['invoice.pdf', 'photo.jpg'],
  }),
  transcriptSource: new WebSpeechTranscriptSource({ lang: 'en-US' }),
  // intentEngine defaults to HeuristicIntentEngine: no binaries, no network.
});

engine.registerAction({
  name: 'delete_file', // snake_case: each token is a voice hint
  description: 'Delete a file by name',
  schema: z.object({
    name: z.string().describe('file name'),
  }),
  handler: (args, context) => {
    // args is fully typed and Zod-validated; context is the frozen snapshot.
    console.log('deleting', args.name, 'selection was', context.selectedFiles);
    return `Deleted ${args.name}.`; // returned strings are spoken back
  },
});

engine.on('action', (event) => console.log('ran', event.name, event.args));
engine.on('clarify', (event) => console.log('engine asked:', event.reason));

await engine.start(); // resolves after mic access is granted
```

Say *"delete file invoice dot p d f"* and the handler runs, the result is announced via speech synthesis, and an `action` event fires.

::: warning
`WebSpeechTranscriptSource` relies on the browser-native `SpeechRecognition` API. In Chrome, recognition audio may be processed by a cloud service. For a pipeline that works offline, see [Transcript Sources](/guide/transcript-sources) and [Privacy](/guide/privacy).
:::

## What happens on unclear speech

The engine never guesses. If confidence is below the threshold (default `0.6`), or required arguments are missing, the user hears a clarification question, for example:

> I understood "delete_file", but I'm missing a value for "name".

Tune the threshold with `confidenceThreshold`, or handle the `clarify` event to render your own UI.

## Going further

- [Actions](/guide/actions): naming, schemas, and the handler contract
- [Context Snapshots](/guide/context): what the intent engine is allowed to see
- [Transcript Sources](/guide/transcript-sources): WebSpeech and the offline pipeline
- [Intent Engines](/guide/intent-engines): heuristic fallback and the Needle 2 model
- [Events](/guide/events): the full typed event bus
