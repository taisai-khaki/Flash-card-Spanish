/**
 * Microphone input.
 *
 * Uses the browser's built-in Web Speech API so that dictation happens on the
 * device and no audio ever leaves the machine. Available in Chrome and Edge
 * (desktop and Android); Firefox and Safari report "unsupported" and the app
 * silently falls back to typing only.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal structural types — lib.dom does not ship these yet.
interface SpeechAlternativeLike {
  transcript: string;
}
interface SpeechResultLike {
  readonly isFinal: boolean;
  [index: number]: SpeechAlternativeLike;
}
interface SpeechResultListLike {
  readonly length: number;
  [index: number]: SpeechResultLike;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: SpeechResultListLike }) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export interface UseSpeechOptions {
  /** BCP-47 tag, e.g. "es-MX". */
  locale: string;
  /** Called with the transcript each time a final result arrives. */
  onResult: (transcript: string) => void;
  /** Set to false to disable the microphone (e.g. an insecure origin). */
  enabled?: boolean;
}

export interface UseSpeech {
  supported: boolean;
  listening: boolean;
  /** Text heard so far in the current utterance (interim + final). */
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useSpeech({ locale, onResult, enabled = true }: UseSpeechOptions): UseSpeech {
  const [supported] = useState<boolean>(() => getCtor() !== null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const finalText = useRef('');
  const shouldListen = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stop = useCallback(() => {
    shouldListen.current = false;
    try {
      recognition.current?.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError('This browser has no speech recognition. Chrome or Edge is needed.');
      return;
    }
    setError(null);
    finalText.current = '';
    setTranscript('');
    shouldListen.current = true;

    const instance = new Ctor();
    instance.lang = locale;
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 1;

    instance.onstart = () => setListening(true);

    instance.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalText.current = `${finalText.current} ${text}`.trim();
        } else {
          interim += text;
        }
      }
      setTranscript(`${finalText.current} ${interim}`.trim());
      if (finalText.current) onResultRef.current(finalText.current);
    };

    instance.onerror = (event) => {
      if (event.error === 'no-speech') {
        setError('I did not hear anything. Try again, a bit closer to the mic.');
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone permission was denied. Allow it in the address bar.');
        shouldListen.current = false;
      } else if (event.error === 'language-not-supported') {
        setError(`The browser does not support ${locale}.`);
      } else if (event.error !== 'aborted') {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    instance.onend = () => {
      // `continuous` mode still stops on long silences; restart if the user
      // has not pressed stop yet.
      if (shouldListen.current) {
        try {
          instance.start();
          return;
        } catch {
          /* fall through to stopping */
        }
      }
      setListening(false);
    };

    recognition.current = instance;
    try {
      instance.start();
    } catch {
      setError('Could not start the microphone. Try again.');
      setListening(false);
    }
  }, [locale]);

  useEffect(
    () => () => {
      try {
        recognition.current?.abort();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return { supported: supported && enabled, listening, transcript, error, start, stop };
}
