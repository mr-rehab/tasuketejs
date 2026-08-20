# Actions

Actions are the entire integration surface. An action is a named, Zod-typed operation with a handler; the voice pipeline's only job is to pick the right action and fill its arguments.

## Definition

```ts
import { z } from 'zod';

const unregister = engine.registerAction({
  name: 'move_file',
  description: 'Move a file to a destination folder',
  schema: z.object({
    name: z.string().describe('file name'),
    destination: z.enum(['archive', 'documents', 'downloads']),
  }),
  handler: (args, context) => {
    // args: { name: string; destination: 'archive' | 'documents' | 'downloads' }
    return `Moved ${args.name} to ${args.destination}.`;
  },
});

unregister(); // removes the action
```

`registerAction` returns an unregister function. Registering a duplicate name throws (and emits an `error` event with code `registration`).

## Naming rules

Names must match `^[a-z][a-z0-9_]{2,63}$` — lowercase `snake_case`, 3–64 characters. Every underscore-separated token is a voice hint: the heuristic engine matches spoken words against tokens like `move` and `file` in `move_file`. Prefer verb_object names (`delete_file`, `search_notes`, `read_message_aloud`).

## Descriptions are voice hints

The `description` string is compiled into the tool specification the intent engine sees. Words in the description ("Move a file to a destination folder") boost matching when the user phrases things differently from the action name. Write them like you would write a tool description for a capable assistant — short, verb-first, specific.

## Schemas and the grammar compiler

At registration the Zod schema is compiled into a compact grammar (`GrammarConstraint`) that describes parameters to the intent engine. Supported constructs:

- `z.object` (nested objects included)
- `z.string`, `z.number`, `z.boolean`
- `z.enum` / `z.literal`
- `z.array` with `min`/`max`/`length` checks
- `z.union`, `z.optional`, `z.default`, `z.nullable`

Refinements (`.refine`, `.min(1)` on strings, etc.) are **not** part of the grammar — they are enforced when arguments are re-validated with `schema.safeParse` right before dispatch. Anything the compiler cannot represent throws `UnsupportedGrammarError` at registration time, so surprises never happen mid-conversation.

## How arguments are extracted

With the default `HeuristicIntentEngine`:

- **Quoted values** fill parameters in declaration order: *move "invoice.pdf" to archive*.
- **Named parameters** use the spoken key: *move file name invoice destination archive*. Both `name` and `name` spoken as `name`/`camelCase` variants are understood.
- **Coercion** — numbers ("three" aside, digits parse), booleans (`yes`/`no`/`on`/`off`), enums match case-insensitively.

If a required parameter cannot be filled, the engine asks instead of guessing, and the confidence gate re-validates everything against the schema before dispatch.

## The handler contract

```ts
handler: async (args, context) => {
  await api.moveFile(args.name, args.destination);
  return `Moved ${args.name} to ${args.destination}.`;
};
```

- Receives fully **validated** `args` (typed from the schema) and the frozen [context snapshot](/guide/context).
- Must return a **non-empty string** — it is announced to the user via the feedback dispatcher and published on the `action` event. Handlers that return nothing are rejected with an error.
- Thrown errors are contained: the user hears "That action failed." and an `error` event with code `handler-failed` fires. The pipeline keeps running.
