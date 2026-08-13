'use client';

import { useEffect, useState } from 'react';
import type { ResultsData } from './types';

export function useRoomResults(pin: string, enabled: boolean) {
  const [results, setResults] = useState<ResultsData | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`/api/rooms/${pin}/results`)
      // An error body is JSON too, and `{ error }` has no `players`, so storing
      // it unchecked crashed ResultsScreen on results.players.map. Staying null
      // keeps the "Loading results..." branch, which is the honest state.
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setResults(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pin, enabled]);

  return results;
}
