// Generic shape any game mode's results boil down to — a future mode only
// has to produce this shape (ranking/time/mistakes), not a whole new
// results UI. ResultsScreen renders this regardless of which mode played.
export interface ResultsData {
  players: { id: string; name: string; team: string; score: number }[];
  teamTotals: { team: string; score: number }[] | null;
  totalTimeSeconds: number | null;
  commonMistakes: { grammarPoint: string; count: number; explanation: string }[];
}
