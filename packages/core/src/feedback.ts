export interface FeedbackDispatcher {
  announce(text: string): void;
}

export interface SpeechFeedbackOptions {
  lang?: string;
  rate?: number;
  pitch?: number;
  voiceURI?: string;
}

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

export class NullFeedback implements FeedbackDispatcher {
  announce(): void {
    // Intentional no-op — pass `feedback: null` or this class to silence announcements.
     
  }
}
