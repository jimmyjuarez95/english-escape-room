'use client';

import { useState, type FormEvent } from 'react';
import { useSpeechRecognition } from '@/lib/speech/useSpeechRecognition';
import type { ChallengeInputProps } from './types';

export default function Speaking({ prompt, onSubmit, disabled }: ChallengeInputProps) {
  const [text, setText] = useState('');
  const [useTextInput, setUseTextInput] = useState(false);
  const { supported, listening, transcript, start, reset } = useSpeechRecognition();
  if (prompt.type !== 'speaking') return null;

  const showTextInput = useTextInput || !supported;

  function handleTextSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ text });
    setText('');
  }

  function handleSpeakSubmit() {
    onSubmit({ text: transcript });
    reset();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-muted">Say out loud:</p>
      <p className="text-center text-xl font-bold text-brand">&ldquo;{prompt.targetSentence}&rdquo;</p>

      {showTextInput ? (
        <form onSubmit={handleTextSubmit} className="flex flex-col gap-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            required
            aria-label="Type the sentence"
            className="rounded-xl border-2 border-border bg-background px-4 py-3 text-center text-lg font-semibold text-foreground focus:border-brand focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled}
            className="rounded-xl bg-brand px-6 py-3 font-display font-bold text-brand-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Answer
          </button>
        </form>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={start}
            disabled={disabled || listening}
            className="rounded-full bg-accent px-8 py-4 font-display font-bold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {listening ? 'Listening...' : '🎤 Speak'}
          </button>
          {transcript && (
            <p className="rounded-xl bg-surface border border-border px-4 py-2 text-foreground">
              I heard: &ldquo;{transcript}&rdquo;
            </p>
          )}
          {transcript && (
            <button
              type="button"
              onClick={handleSpeakSubmit}
              disabled={disabled}
              className="rounded-xl bg-brand px-6 py-3 font-display font-bold text-brand-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Submit
            </button>
          )}
          <button
            type="button"
            onClick={() => setUseTextInput(true)}
            className="text-sm font-semibold text-muted underline underline-offset-2 hover:text-foreground"
          >
            I&apos;d rather type
          </button>
        </div>
      )}
    </div>
  );
}
