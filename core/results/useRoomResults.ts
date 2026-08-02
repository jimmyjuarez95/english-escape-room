'use client';

import { useEffect, useState } from 'react';
import type { ResultsData } from './types';

export function useRoomResults(pin: string, enabled: boolean) {
  const [results, setResults] = useState<ResultsData | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`/api/rooms/${pin}/results`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setResults(data);
      });
    return () => {
      cancelled = true;
    };
  }, [pin, enabled]);

  return results;
}
