/** Tuning knobs for {@link SpeechSegmenter}; all defaults suit 32ms frames at 16kHz. */
export interface VadOptions {
  startThreshold?: number;
  endThreshold?: number;
  startFrames?: number;
  endFrames?: number;
  maxSegmentFrames?: number;
}

interface ResolvedVadOptions {
  startThreshold: number;
  endThreshold: number;
  startFrames: number;
  endFrames: number;
  maxSegmentFrames: number;
}

/** Root-mean-square energy of a PCM frame — the simplest usable voice-activity signal. */
export function rms(frame: Float32Array): number {
  let sum = 0;
  for (const sample of frame) sum += sample * sample;
  return Math.sqrt(sum / frame.length);
}

/**
 * Energy-based VAD with hangover: pure state machine over fixed-size frames,
 * so it is fully testable without audio hardware. Frames of N samples at 16 kHz:
 * 512 samples = 32 ms (the Silero-compatible frame size).
 */
export class SpeechSegmenter {
  private readonly opts: ResolvedVadOptions;
  private buffer: Float32Array[] = [];
  private preRoll: Float32Array[] = [];
  private inSpeech = false;
  private aboveCount = 0;
  private belowCount = 0;
  private speechFrames = 0;

  constructor(
    private readonly onSegment: (segment: Float32Array) => void,
    options: VadOptions = {},
  ) {
    this.opts = {
      startThreshold: 0.012,
      endThreshold: 0.008,
      startFrames: 3,
      endFrames: 25,
      maxSegmentFrames: 480,
      ...options,
    };
  }

  push(frame: Float32Array): void {
    const level = rms(frame);
    if (!this.inSpeech) {
      this.preRoll.push(frame);
      if (this.preRoll.length > this.opts.startFrames) this.preRoll.shift();
      if (level >= this.opts.startThreshold) {
        this.aboveCount++;
        if (this.aboveCount >= this.opts.startFrames) {
          this.inSpeech = true;
          this.buffer = this.preRoll.splice(0);
          this.speechFrames = this.buffer.length;
          this.belowCount = 0;
        }
      } else {
        this.aboveCount = 0;
      }
      return;
    }

    this.buffer.push(frame);
    this.speechFrames++;
    if (this.speechFrames >= this.opts.maxSegmentFrames) {
      this.emit();
      return;
    }
    if (level < this.opts.endThreshold) {
      this.belowCount++;
      if (this.belowCount >= this.opts.endFrames) this.emit();
    } else {
      this.belowCount = 0;
    }
  }

  flush(): void {
    if (this.inSpeech) this.emit();
  }

  private emit(): void {
    if (this.buffer.length === 0) {
      this.reset();
      return;
    }
    const total = this.buffer.reduce((n, f) => n + f.length, 0);
    const segment = new Float32Array(total);
    let offset = 0;
    for (const f of this.buffer) {
      segment.set(f, offset);
      offset += f.length;
    }
    this.reset();
    this.onSegment(segment);
  }

  private reset(): void {
    this.buffer = [];
    this.preRoll = [];
    this.inSpeech = false;
    this.aboveCount = 0;
    this.belowCount = 0;
    this.speechFrames = 0;
  }
}
