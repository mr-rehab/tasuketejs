import { describe, expect, it } from 'vitest';
import { ContextStore } from '../src/context.js';

describe('ContextStore', () => {
  it('captures and deep-freezes the provider snapshot', () => {
    const store = new ContextStore(() => ({ route: '/home', ids: [1, 2] }));
    const snapshot = store.capture();
    expect(snapshot.route).toBe('/home');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen((snapshot as { ids: unknown[] }).ids)).toBe(true);
    expect(store.current).toBe(snapshot);
  });

  it('drops the largest keys and records __truncated when over the byte limit', () => {
    const store = new ContextStore(
      () => ({ big: 'x'.repeat(500), small: 'ok' }),
      100,
    );
    const snapshot = store.capture();
    expect(snapshot.small).toBe('ok');
    expect(snapshot.big).toBeUndefined();
    expect(snapshot.__truncated).toEqual(['big']);
  });

  it('captures provider failures as a marker instead of throwing', () => {
    const store = new ContextStore(() => {
      throw new Error('store not ready');
    });
    const snapshot = store.capture();
    expect(String(snapshot.__providerError)).toContain('store not ready');
  });

  it('captures non-serializable (circular) providers as an error marker', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const store = new ContextStore(() => circular);
    const snapshot = store.capture();
    expect(snapshot.__contextError).toBe('context snapshot is not serializable');
  });

  it('wraps non-object provider results', () => {
    const store = new ContextStore(() => 'just a string' as unknown as Record<string, unknown>);
    const snapshot = store.capture();
    expect(snapshot.__value).toBe('just a string');
  });
});
