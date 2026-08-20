import { describe, expect, it } from 'vitest';
import { WebSpeechTranscriptSource } from '../src/stt/web-speech.js';

describe('WebSpeechTranscriptSource (no SpeechRecognition available)', () => {
  it('reports unsupported instead of throwing', async () => {
    expect(WebSpeechTranscriptSource.supported).toBe(false);
    const source = new WebSpeechTranscriptSource();
    const errors: [string, string | undefined][] = [];
    await source.start({
      onUtterance: () => {},
      onError: (code, detail) => errors.push([code, detail]),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0][0]).toBe('unsupported');
  });
});
