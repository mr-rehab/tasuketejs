# Context Snapshots

The intent engine does not look at your app's internals. Whatever you want it to know about app state — current selection, screen name, available items — you provide through a **context provider**.

## The provider

```ts
const engine = new TasuketeEngine({
  contextProvider: () => ({
    route: 'file-manager',
    selectedFiles: selectedStore.ids,
    folders: folderStore.names,
  }),
  // ...
});
```

The provider is a plain callback invoked **once per utterance**, after speech ends and before the intent engine parses. It returns a plain serializable object (`undefined`/`null` allowed — becomes an empty snapshot).

## Snapshot guarantees

Each capture produces an immutable snapshot with hard limits, so a runaway provider can never destabilize the voice pipeline or blow the memory budget of an edge model:

| Guarantee | Behavior |
| --- | --- |
| **Frozen** | The snapshot is deep-frozen. Handlers and the intent engine receive the exact same object; nobody can mutate it mid-flight. |
| **Size-capped** | Serialized to at most 8KB by default (`contextByteLimit` option). Largest keys are dropped first; a `__truncated` key lists what was removed. |
| **Failure-isolated** | If the provider throws, the snapshot becomes `{ __providerError }` and the utterance still processes. If the value is not serializable, you get `{ __contextError }`. |

```ts
const engine = new TasuketeEngine({
  contextProvider,
  contextByteLimit: 2048, // tighten the budget
  // ...
});
```

The last snapshot is also available synchronously:

```ts
engine.context; // ContextSnapshot | null — what the last utterance saw
```

## Privacy posture

The snapshot is the complete view the intent engine gets of your app — the SDK adds nothing on its own. If you keep the provider minimal ("three files selected, screen: inbox"), that is all the model ever knows. See [Privacy](/guide/privacy).

## Guidance

- Keep values small and speakable: ids, names, counts, routes. Not React trees, not functions.
- Return fresh data every call — snapshots are never reused across utterances.
- Use `.describe()` on action schemas rather than stuffing parameter docs into context.
