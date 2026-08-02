import type { ResultsData } from '@/core/results/types';

const MEDALS = ['🥇', '🥈', '🥉'];

export default function ResultsScreen({ results }: { results: ResultsData }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h2 className="text-center font-display text-4xl font-extrabold text-brand">
        🎉 Resultados
      </h2>

      {results.totalTimeSeconds !== null && (
        <p className="mt-2 text-center text-muted">
          Tiempo total:{' '}
          <span className="font-bold text-foreground">
            {Math.floor(results.totalTimeSeconds / 60)}m {results.totalTimeSeconds % 60}s
          </span>
        </p>
      )}

      {results.teamTotals && (
        <div className="mt-8">
          <h3 className="font-display text-lg font-bold text-foreground">Puntaje por equipo</h3>
          <div className="mt-3 flex gap-4">
            {results.teamTotals
              .slice()
              .sort((a, b) => b.score - a.score)
              .map((t) => (
                <div
                  key={t.team}
                  className="flex-1 rounded-2xl bg-surface border border-border px-4 py-3 text-center"
                >
                  <p className="font-display font-bold text-foreground">Equipo {t.team}</p>
                  <p className="font-display text-2xl font-extrabold text-brand">{t.score} pts</p>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h3 className="font-display text-lg font-bold text-foreground">Ranking individual</h3>
        <ol className="mt-3 space-y-2">
          {results.players.map((p, index) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-xl bg-surface border border-border px-4 py-3"
            >
              <span className="flex items-center gap-3 font-semibold text-foreground">
                <span className="w-6 text-center">{MEDALS[index] ?? index + 1}</span>
                {p.name}
                {p.team && <span className="text-sm text-muted">(Equipo {p.team})</span>}
              </span>
              <span className="font-display font-extrabold text-brand">{p.score} pts</span>
            </li>
          ))}
        </ol>
      </div>

      {results.commonMistakes.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display text-lg font-bold text-foreground">
            Errores comunes del grupo
          </h3>
          <ul className="mt-3 space-y-2">
            {results.commonMistakes.map((m) => (
              <li
                key={m.grammarPoint}
                className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-foreground"
              >
                {m.explanation}{' '}
                <span className="text-muted">
                  ({m.count} {m.count === 1 ? 'vez' : 'veces'})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
