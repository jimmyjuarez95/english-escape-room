'use client';

import { useState, type FormEvent } from 'react';
import type { ChallengeInputProps } from './types';

export default function SentenceCorrection({ prompt, onSubmit, disabled }: ChallengeInputProps) {
  const [text, setText] = useState('');
  if (prompt.type !== 'sentence_correction') return null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ text });
    setText('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-center text-muted">Correct this sentence:</p>
      <p className="text-center text-lg font-semibold text-error">
        &ldquo;{prompt.incorrectSentence}&rdquo;
      </p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        required
        aria-label="Corrected sentence"
        className="rounded-xl border-2 border-border bg-background px-4 py-3 text-center text-lg font-semibold text-foreground focus:border-brand focus:outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-xl bg-brand px-6 py-3 font-display font-bold text-brand-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Submit correction
      </button>
    </form>
  );
}
