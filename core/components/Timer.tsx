'use client';

import { useEffect, useState } from 'react';

/**
 * Counts down to an absolute deadline timestamp (not a server "tick"), so
 * clock skew between devices only affects the display, never which client
 * thinks a challenge is still open — that's enforced server-side regardless.
 */
export default function Timer({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!deadline) return null;
  const secondsLeft = Math.max(0, Math.round((new Date(deadline).getTime() - now) / 1000));
  const urgent = secondsLeft <= 10;

  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-display text-lg font-bold tabular-nums ${
        urgent ? 'bg-error/10 text-error' : 'bg-accent/15 text-accent-foreground'
      }`}
    >
      ⏱ {secondsLeft}s
    </span>
  );
}
