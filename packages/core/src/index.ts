export const VERSION = '0.1.0';

// engine
export { TasuketeEngine, type TasuketeEngineOptions } from './engine.js';

// registry & actions
export {
  ActionRegistry,
  ArgsValidationError,
  type ActionDefinition,
  type ToolSpec,
} from './registry.js';

// context
export { ContextStore, type ContextProvider, type ContextSnapshot } from './context.js';

// grammar
export { compileGrammar, UnsupportedGrammarError, type GrammarConstraint } from './grammar.js';

// events
export {
  TasuketeEventBus,
  type TasuketeEventMap,
  type TasuketeEventName,
  type TasuketeErrorCode,
  type TasuketeErrorEvent,
  type TranscriptEvent,
  type ActionEvent,
  type ClarifyEvent,
} from './events.js';

// intent engines
export { HeuristicIntentEngine, type HeuristicIntentEngineOptions } from './needle/heuristic.js';
export {
  Needle2Engine,
  type Needle2EngineOptions,
  type Needle2Module,
  type Needle2Factory,
  type Needle2RunOutput,
} from './needle/needle2.js';
export type {
  IntentEngine,
  IntentInput,
  IntentResult,
  ExecuteIntent,
  ClarifyIntent,
  UnknownIntent,
} from './needle/types.js';

// gate
export { ConfidenceGate, type GateOutcome } from './gate.js';

// feedback
export {
  SpeechSynthesisFeedback,
  NullFeedback,
  type FeedbackDispatcher,
  type SpeechFeedbackOptions,
} from './feedback.js';

// transcript sources
export {
  WebSpeechTranscriptSource,
  getSpeechRecognitionCtor,
  type WebSpeechTranscriptSourceOptions,
  type SpeechRecognitionCtor,
  type SpeechRecognitionLike,
  type SpeechRecognitionResultEventLike,
} from './stt/web-speech.js';
export {
  OfflineTranscriptSource,
  type OfflineTranscriptSourceOptions,
} from './stt/offline.js';
export type { TranscriptSource, TranscriptSourceCallbacks, SttEngine } from './stt/types.js';

// audio spine
export { MicSource, MicPermissionError, type MicSourceOptions, type FrameSource } from './audio/mic-source.js';
export { SpeechSegmenter, rms, type VadOptions } from './audio/energy-vad.js';
export { FRAME_WORKLET_SRC, TASUKETE_FRAMER_NAME } from './audio/worklet.js';
