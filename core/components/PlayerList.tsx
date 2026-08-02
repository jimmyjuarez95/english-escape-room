import type { Database } from '@/core/supabase/types';

type Player = Database['public']['Tables']['players']['Row'];

export default function PlayerList({ players }: { players: Player[] }) {
  return (
    <div className="w-full">
      <p className="font-display text-sm font-bold uppercase tracking-wide text-muted">
        Jugadores ({players.length})
      </p>
      {players.length === 0 ? (
        <p className="mt-3 text-muted">Esperando a que se unan jugadores...</p>
      ) : (
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {players.map((player) => (
            <li
              key={player.id}
              className="rounded-full bg-surface border border-border px-4 py-2 font-semibold text-foreground"
            >
              {player.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
