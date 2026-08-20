---
layout: home

hero:
  name: TasuketeJS
  text: Voice accessibility that never leaves the device
  tagline: An intent-driven, 100% client-side voice SDK for PWAs and mobile apps. Users speak — your registered actions run. No UI scraping, no cloud dependency.
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
  - title: Intent-driven
    details: Voice in, action out. You register typed actions; the engine maps speech to intents and dispatches to your handlers. It never walks or scrapes your UI tree.
  - title: 100% client-side
    details: No SDK-mandated network calls, no telemetry. A guaranteed-offline pipeline (mic frames, VAD, local STT) keeps every byte on the device.
  - title: Framework-agnostic
    details: Plain TypeScript with zero framework dependencies. Use it from React, Vue, Svelte, Solid, or React Native.
  - title: Zod-validated actions
    details: Action schemas compile into a grammar for the intent engine, and arguments are re-validated with Zod before any handler runs.
  - title: Confidence gate
    details: Uncertain speech never executes. Below-threshold intents route to a clarification question instead of running the wrong action.
  - title: Tiny footprint
    details: Ships with a deterministic zero-dependency heuristic engine. The optional edge-SLM path runs inside a 28MB memory budget with enforcement.
---
