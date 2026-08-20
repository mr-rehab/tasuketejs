import { describe, expect, it } from 'vitest';
import { TasuketeEventBus } from '../src/events.js';

describe('TasuketeEventBus', () => {
  it('delivers events to subscribers and supports unsubscribe', () => {
    const bus = new TasuketeEventBus();
    const seen: string[] = [];
    const off = bus.on('transcript', (e) => seen.push(e.text));
    bus.emit('transcript', { text: 'hello' });
    off();
    bus.emit('transcript', { text: 'world' });
    expect(seen).toEqual(['hello']);
  });

  it('isolates listener failures from other listeners', () => {
    const bus = new TasuketeEventBus();
    const seen: string[] = [];
    bus.on('transcript', () => {
      throw new Error('broken listener');
    });
    bus.on('transcript', (e) => seen.push(e.text));
    expect(() => bus.emit('transcript', { text: 'still works' })).not.toThrow();
    expect(seen).toEqual(['still works']);
  });

  it('removeAll clears every listener', () => {
    const bus = new TasuketeEventBus();
    const seen: unknown[] = [];
    bus.on('action', (e) => seen.push(e));
    bus.on('clarify', (e) => seen.push(e));
    bus.removeAll();
    bus.emit('action', { name: 'a', args: {}, result: 'r', confidence: 1 });
    bus.emit('clarify', { reason: 'r', confidence: 0, text: 't' });
    expect(seen).toEqual([]);
  });
});
