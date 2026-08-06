'use client';

import { useState, type FormEvent } from 'react';
import { useSpeechSynthesis } from '@/lib/speech/useSpeechSynthesis';
import type { ChallengeInputProps } from './types';

export default function Listening({ prompt, onSubmit, disabled }: ChallengeInputProps) {
  const { speak, supported } = useSpeechSynthesis();
  const [text, setText] = useState('');
  if (prompt.type !== 'listening') return null;

  function handleTextSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ text });
    setText('');
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => speak(prompt.audioText)}
        disabled={!supported}
        className="mx-auto rounded-full bg-accent px-6 py-3 font-display font-bold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        🔊 Listen
      </button>
      {!supported && (
        <div className="rounded-xl bg-surface border border-border px-4 py-3 text-center">
          <p className="text-sm text-muted">Your browser doesn&apos;t support speech synthesis. Read the text:</p>
          <p className="mt-1 font-semibold text-foreground">{prompt.audioText}</p>
        </div>
      )}
      <p className="text-center text-lg font-semibold text-foreground">{prompt.question}</p>
      {prompt.options ? (
        <div className="grid grid-cols-1 gap-3">
          {prompt.options.map((option, index) => (
            <button
              key={option}
              type="button"
              onClick={() => onSubmit({ index })}
              disabled={disabled}
              className="rounded-xl border-2 border-border bg-background px-4 py-3 font-semibold text-foreground transition hover:border-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {option}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={handleTextSubmit} className="flex flex-col gap-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            required
            aria-label="Your answer"
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
      )}
    </div>
  );
}
