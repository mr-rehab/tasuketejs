import { describe, expect, it, vi } from 'vitest';
import { OfflineTranscriptSource } from '../src/stt/offline.js';
import type { FrameSource } from '../src/audio/mic-source.js';

class FakeFrameSource implements FrameSource {
  started = false;
  private onFrame: ((frame: Float32Array) => void) | null = null;
  async start(onFrame: (frame: Float32Array) => void): Promise<void> {
    this.started = true;
    this.onFrame = onFrame;
  }
  async stop(): Promise<void> {
    this.started = false;
    this.onFrame = null;
  }
  push(frame: Float32Array): void {
    this.onFrame?.(frame);
  }
}

const LOUD = () => new Float32Array(512).fill(0.1);
const QUIET = () => new Float32Array(512).fill(0.001);

function harness() {
  const frames = new FakeFrameSource();
  const utterances: string[] = [];
  const errors: [string, string | undefined][] = [];
  const source = new OfflineTranscriptSource({
    frameSource: frames,
    stt: { transcribe: async (segment) => `heard ${segment.length} samples` },
  });
  return { frames, source, utterances, errors };
}

describe('OfflineTranscriptSource', () => {
  it('transcribes a completed speech segment into an utterance', async () => {
    const { frames, source, utterances, errors } = harness();
    await source.start({
      onUtterance: (text) => utterances.push(text),
      onError: (code, detail) => errors.push([code, detail]),
    });
    expect(frames.started).toBe(true);
    for (let i = 0; i < 5; i++) frames.push(LOUD());
    for (let i = 0; i < 25; i++) frames.push(QUIET());
    await vi.waitFor(() => expect(utterances).toHaveLength(1));
    expect(utterances[0]).toBe(`heard ${(5 + 25) * 512} samples`);
    expect(errors).toHaveLength(0);
    await source.stop();
    expect(frames.started).toBe(false);
  });

  it('flushes and transcribes trailing speech on stop', async () => {
    const frames = new FakeFrameSource();
    const utterances: string[] = [];
    const source = new OfflineTranscriptSource({
      frameSource: frames,
      stt: { transcribe: async (segment) => `heard ${segment.length} samples` },
      vad: { startFrames: 2, endFrames: 25 },
    });
    await source.start({ onUtterance: (t) => utterances.push(t), onError: () => {} });
    frames.push(LOUD());
    frames.push(LOUD());
    await source.stop();
    await vi.waitFor(() => expect(utterances).toHaveLength(1));
    expect(utterances[0]).toBe(`heard ${2 * 512} samples`);
  });

  it('reports stt failures through onError without crashing', async () => {
    const frames = new FakeFrameSource();
    const errors: [string, string | undefined][] = [];
    const source = new OfflineTranscriptSource({
      frameSource: frames,
      stt: {
        transcribe: async () => {
          throw new Error('wasm boom');
        },
      },
    });
    await source.start({ onUtterance: () => {}, onError: (code, detail) => errors.push([code, detail]) });
    for (let i = 0; i < 3; i++) frames.push(LOUD());
    for (let i = 0; i < 25; i++) frames.push(QUIET());
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0][0]).toBe('stt-failed');
    expect(errors[0][1]).toContain('wasm boom');
    await source.stop();
  });
});
