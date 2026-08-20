---
layout: home

hero:
  name: TasuketeJS
  text: Voice control for web and mobile apps
  tagline: You register actions with a Zod schema. The SDK transcribes speech, picks the matching action, validates arguments, calls your handler, and speaks the result.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: API Reference
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/mr-rehab/tasuketejs

features:
  - title: Actions, not DOM scraping
    details: An action has a name, a Zod schema, and a handler. The engine maps speech to a registered action and calls it. It never inspects your UI tree.
  - title: Runs locally
    details: No network calls, no telemetry. The offline pipeline (mic capture, VAD, local STT) keeps audio and text on the device.
  - title: No framework dependency
    details: Plain TypeScript. Use it from React, Vue, Svelte, Solid, or React Native.
  - title: Zod validation
    details: Action schemas compile into a grammar for the intent engine. Arguments are validated with Zod before a handler runs.
  - title: Confidence gate
    details: Speech below the confidence threshold produces a clarification question instead of running the wrong action.
  - title: Small runtime
    details: The default intent engine is deterministic with no dependencies. The optional SLM engine is capped at 28MB of RAM, enforced in code.
---
