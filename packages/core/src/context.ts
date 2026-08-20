/** Deep-frozen, byte-capped view of app state handed to intent engines and handlers. */
export type ContextSnapshot = Readonly<Record<string, unknown>>;
/** Returns the app state for the current utterance. Keep it small, serializable, and speakable. */
export type ContextProvider = () => Record<string, unknown> | undefined | null;

const DEFAULT_BYTE_LIMIT = 8192;

/**
 * Captures context snapshots with hard guarantees: provider errors become
 * `{ __providerError }`, non-serializable values become `{ __contextError }`,
 * and oversized snapshots drop their largest keys (listed in `__truncated`).
 */
export class ContextStore {
  private last: ContextSnapshot | null = null;

  constructor(
    private readonly provider: ContextProvider,
    private readonly byteLimit: number = DEFAULT_BYTE_LIMIT,
  ) {}

  capture(): ContextSnapshot {
    let raw: unknown;
    try {
      raw = this.provider();
    } catch (err) {
      raw = { __providerError: String(err) };
    }
    raw ??= {};
    if (typeof raw !== 'object' || Array.isArray(raw)) raw = { __value: raw };

    const snapshot = this.fit(raw as Record<string, unknown>);
    this.last = snapshot;
    return snapshot;
  }

  get current(): ContextSnapshot | null {
    return this.last;
  }

  private fit(raw: Record<string, unknown>): ContextSnapshot {
    const entries = Object.entries(raw);
    const dropped: string[] = [];
    try {
      let serialized = JSON.stringify(Object.fromEntries(entries));
      while (serialized.length > this.byteLimit && entries.length > 0) {
        const i = largestIndex(entries);
        dropped.push(entries[i][0]);
        entries.splice(i, 1);
        serialized = JSON.stringify(Object.fromEntries(entries));
      }
      const obj = JSON.parse(serialized) as Record<string, unknown>;
      if (dropped.length > 0) obj.__truncated = dropped;
      return deepFreeze(obj);
    } catch {
      return deepFreeze({ __contextError: 'context snapshot is not serializable' });
    }
  }
}

function safeSize(key: string, value: unknown): number {
  try {
    return key.length + JSON.stringify(value).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function largestIndex(entries: [string, unknown][]): number {
  let largest = -1;
  let index = 0;
  entries.forEach(([key, value], i) => {
    const size = safeSize(key, value);
    if (size > largest) {
      largest = size;
      index = i;
    }
  });
  return index;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
