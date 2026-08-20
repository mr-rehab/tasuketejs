/** Speaks (or otherwise surfaces) pipeline outcomes to the user. */
export interface FeedbackDispatcher {
  announce(text: string): void;
}

export interface SpeechFeedbackOptions {
  /** BCP-47 language tag, e.g. `en-US`. */
  lang?: string;
  /** Speaking rate; 1 is normal. */
  rate?: number;
  /** Pitch; 1 is normal. */
  pitch?: number;
  /** Exact voice to use, matched against `speechSynthesis.getVoices()`. */
  voiceURI?: string;
}

/**
 * Default feedback: announcements via the Web Speech synthesis API.
 * Falls back to `console.info` where synthesis is unavailable, and cancels
 * any in-flight speech so clarifications are never queued behind stale text.
 */
export class SpeechSynthesisFeedback implements FeedbackDispatcher {
  constructor(private readonly opts: SpeechFeedbackOptions = {}) {}

  announce(text: string): void {
    const synth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
    if (!synth) {
      console.info('[tasukete]', text);
      return;
    }
    if (synth.speaking || synth.pending) synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (this.opts.lang) utterance.lang = this.opts.lang;
    if (this.opts.rate !== undefined) utterance.rate = this.opts.rate;
    if (this.opts.pitch !== undefined) utterance.pitch = this.opts.pitch;
    if (this.opts.voiceURI) {
      const voice = synth.getVoices().find((v) => v.voiceURI === this.opts.voiceURI);
      if (voice) utterance.voice = voice;
    }
    synth.speak(utterance);
  }
}

/** Silence-all feedback — pass an instance (or `feedback: null`) to opt out of announcements. */
export class NullFeedback implements FeedbackDispatcher {
  announce(): void {
    // Intentional no-op — pass `feedback: null` or this class to silence announcements.
     
  }
}
