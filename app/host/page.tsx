'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
type Level = (typeof CEFR_LEVELS)[number];
type PlayStyle = 'collaborative' | 'teams';

export default function HostSetupPage() {
  const router = useRouter();
  const [level, setLevel] = useState<Level>('A1');
  const [playStyle, setPlayStyle] = useState<PlayStyle>('collaborative');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateRoom() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameMode: 'escape_room', level, playStyle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear la sala');

      localStorage.setItem(
        `host:${data.room.pin}`,
        JSON.stringify({ roomId: data.room.id, hostSecret: data.hostSecret })
      );
      router.push(`/host/${data.room.pin}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sala');
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-12">
      <h1 className="text-center font-display text-3xl font-extrabold text-brand">
        Crear sala 🔐
      </h1>

      <fieldset>
        <legend className="font-display text-sm font-bold uppercase tracking-wide text-muted">
          Nivel (CEFR)
        </legend>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {CEFR_LEVELS.map((lvl) => (
            <label key={lvl} className="cursor-pointer">
              <input
                type="radio"
                name="level"
                value={lvl}
                checked={level === lvl}
                onChange={() => setLevel(lvl)}
                className="peer sr-only"
              />
              <span className="flex items-center justify-center rounded-xl border-2 border-border bg-surface py-3 font-display font-bold text-foreground transition peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-foreground">
                {lvl}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-display text-sm font-bold uppercase tracking-wide text-muted">
          Modo de equipo
        </legend>
        <div className="mt-3 flex flex-col gap-3">
          <label className="cursor-pointer">
            <input
              type="radio"
              name="playStyle"
              value="collaborative"
              checked={playStyle === 'collaborative'}
              onChange={() => setPlayStyle('collaborative')}
              className="peer sr-only"
            />
            <span className="block rounded-xl border-2 border-border bg-surface px-4 py-3 font-semibold text-foreground transition peer-checked:border-brand peer-checked:bg-brand/10">
              🤝 Todos juntos (colaborativo)
            </span>
          </label>
          <label className="cursor-pointer">
            <input
              type="radio"
              name="playStyle"
              value="teams"
              checked={playStyle === 'teams'}
              onChange={() => setPlayStyle('teams')}
              className="peer sr-only"
            />
            <span className="block rounded-xl border-2 border-border bg-surface px-4 py-3 font-semibold text-foreground transition peer-checked:border-brand peer-checked:bg-brand/10">
              ⚔️ 2 equipos
            </span>
          </label>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </p>
      )}

      <button
        onClick={handleCreateRoom}
        disabled={loading}
        className="rounded-xl bg-brand px-6 py-4 font-display font-bold text-brand-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Creando sala...' : 'Crear sala'}
      </button>
    </main>
  );
}
