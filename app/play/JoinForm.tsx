'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pin, setPin] = useState(searchParams.get('pin') ?? '');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${pin}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not join the room');

      localStorage.setItem(
        `player:${pin}`,
        JSON.stringify({
          playerId: data.player.id,
          clientToken: data.clientToken,
          name: data.player.name,
        })
      );
      router.push(`/play/${pin}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the room');
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-12">
      <div className="text-center">
        <h1 className="font-display text-3xl font-extrabold text-brand">Join a room 🔐</h1>
        <p className="mt-2 text-muted">Enter the PIN you see on the host&apos;s screen.</p>
      </div>

      <form onSubmit={handleJoin} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="font-display text-sm font-bold uppercase tracking-wide text-muted">
            Room PIN
          </span>
          <input
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            maxLength={6}
            required
            placeholder="123456"
            className="rounded-xl border-2 border-border bg-surface px-4 py-4 text-center font-display text-3xl font-bold tracking-[0.3em] text-foreground focus:border-brand focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-display text-sm font-bold uppercase tracking-wide text-muted">
            Your name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            required
            placeholder="E.g. Jimmy"
            className="rounded-xl border-2 border-border bg-surface px-4 py-4 text-lg font-semibold text-foreground focus:border-brand focus:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-brand px-6 py-4 font-display text-lg font-bold text-brand-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Joining...' : 'Join'}
        </button>
      </form>
    </main>
  );
}
