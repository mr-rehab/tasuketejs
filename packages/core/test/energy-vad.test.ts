import { describe, expect, it } from 'vitest';
import { rms, SpeechSegmenter } from '../src/audio/energy-vad.js';

const LOUD = () => new Float32Array(512).fill(0.1);
const QUIET = () => new Float32Array(512).fill(0.001);

describe('rms', () => {
  it('computes root mean square of a frame', () => {
    expect(rms(new Float32Array(512))).toBe(0);
    expect(rms(new Float32Array(512).fill(1))).toBeCloseTo(1);
    expect(rms(new Float32Array(512).fill(0.1))).toBeCloseTo(0.1);
  });
});

describe('SpeechSegmenter', () => {
  it('emits one segment for a burst of speech followed by silence', () => {
    const segments: Float32Array[] = [];
    const segmenter = new SpeechSegmenter((s) => segments.push(s), { startFrames: 3, endFrames: 25 });
    for (let i = 0; i < 5; i++) segmenter.push(LOUD());
    for (let i = 0; i < 25; i++) segmenter.push(QUIET());
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength((5 + 25) * 512);
    segmenter.flush();
    expect(segments).toHaveLength(1);
  });

  it('ignores short noise bursts', () => {
    const segments: Float32Array[] = [];
    const segmenter = new SpeechSegmenter((s) => segments.push(s), { startFrames: 3, endFrames: 5 });
    segmenter.push(QUIET());
    segmenter.push(LOUD());
    segmenter.push(QUIET());
    segmenter.push(LOUD());
    segmenter.push(QUIET());
    segmenter.flush();
    expect(segments).toHaveLength(0);
  });

  it('caps segment length at maxSegmentFrames and starts a new segment', () => {
    const segments: Float32Array[] = [];
    const segmenter = new SpeechSegmenter((s) => segments.push(s), {
      startFrames: 2,
      endFrames: 5,
      maxSegmentFrames: 10,
    });
    for (let i = 0; i < 12; i++) segmenter.push(LOUD());
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(10 * 512);
    segmenter.flush();
    expect(segments).toHaveLength(2);
    expect(segments[1]).toHaveLength(2 * 512);
  });

  it('flush emits trailing speech on stop', () => {
    const segments: Float32Array[] = [];
    const segmenter = new SpeechSegmenter((s) => segments.push(s), { startFrames: 2, endFrames: 25 });
    segmenter.push(LOUD());
    segmenter.push(LOUD());
    expect(segments).toHaveLength(0);
    segmenter.flush();
    expect(segments).toHaveLength(1);
    expect(segments[0]).toHaveLength(2 * 512);
  });
});
