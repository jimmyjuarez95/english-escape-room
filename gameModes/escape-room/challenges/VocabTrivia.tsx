'use client';

import type { ChallengeInputProps } from './types';

export default function VocabTrivia({ prompt, onSubmit, disabled }: ChallengeInputProps) {
  if (prompt.type !== 'vocab_trivia') return null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-lg font-semibold text-foreground">{prompt.question}</p>
      <div className="grid grid-cols-2 gap-3">
        {prompt.options.map((option, index) => (
          <button
            key={option}
            type="button"
            onClick={() => onSubmit({ index })}
            disabled={disabled}
            className="rounded-xl border-2 border-border bg-background px-4 py-4 font-semibold text-foreground transition hover:border-brand hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
