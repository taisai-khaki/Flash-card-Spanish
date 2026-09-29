import { useEffect, useRef } from 'react';
import { useSpeech } from '../hooks/useSpeechRecognition';

interface AnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  locale: string;
  micEnabled: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * The answer box: type it, or press the microphone and say it in Spanish.
 * Enter checks the answer, Shift+Enter adds a line break.
 */
export default function AnswerInput({
  value,
  onChange,
  onSubmit,
  disabled,
  locale,
  micEnabled,
  placeholder = 'Escribe tu traducción en español…',
  autoFocus = true,
}: AnswerInputProps) {
  const area = useRef<HTMLTextAreaElement>(null);

  const speech = useSpeech({
    locale,
    enabled: micEnabled,
    onResult: (transcript) => {
      if (!disabled) onChange(transcript);
    },
  });

  useEffect(() => {
    if (autoFocus) area.current?.focus();
  }, [autoFocus]);

  return (
    <div className="answer-input">
      <textarea
        ref={area}
        className="answer-box"
        value={value}
        dir="ltr"
        lang="es-MX"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        rows={3}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />

      <div className="answer-tools">
        {speech.supported ? (
          <button
            type="button"
            className={`mic-button ${speech.listening ? 'is-listening' : ''}`}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            disabled={disabled}
            aria-pressed={speech.listening}
            title={speech.listening ? 'Stop dictation' : `Dictate in ${locale}`}
          >
            <span aria-hidden="true">{speech.listening ? '⏹' : '🎙'}</span>
            <span className="mic-label">
              {speech.listening ? 'Listening… press to stop' : 'Say it'}
            </span>
          </button>
        ) : (
          <span className="hint-inline">
            {micEnabled
              ? 'Dictation needs Chrome or Edge — typing works everywhere.'
              : 'Dictation is turned off in Settings.'}
          </span>
        )}

        {value.length > 0 && !disabled && (
          <button type="button" className="link-button" onClick={() => onChange('')}>
            Clear
          </button>
        )}

        <span className="spacer" />
        <span className="hint-inline">Enter to check · Shift+Enter for a new line</span>
      </div>

      {speech.listening && speech.transcript.length > 0 && (
        <p className="interim" aria-live="polite">
          <span className="interim-dot" aria-hidden="true" /> “{speech.transcript}”
        </p>
      )}
      {speech.error && <p className="error-text">{speech.error}</p>}
    </div>
  );
}
