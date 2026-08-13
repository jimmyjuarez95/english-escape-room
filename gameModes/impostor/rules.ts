import { pickRandomSubset } from '@/core/random/pickRandomSubset';

// Pure round rules, deliberately free of Supabase imports: both the scoring path
// (/impostor/advance) and the display path (/impostor/reveal) must reach the
// identical verdict, and they used to compute it separately — with several
// impostors that divergence would show up as the payout contradicting what the
// players see on screen.
//
// Everything here is side-effect free. /reveal is a GET that host and players
// re-run on every realtime event, so any awarding done here would inflate scores
// without bound; award_points calls live only in /advance.

export const IMPOSTOR_MIN_PLAYERS = 3;

const CAUGHT_VOTER_POINTS = 100;
const IMPOSTOR_EVADED_POINTS = 150;

export { CAUGHT_VOTER_POINTS, IMPOSTOR_EVADED_POINTS };

export interface ImpostorVote {
  voter_player_id: string;
  voted_player_id: string;
}

export interface RoundOutcome {
  /** Vote counts, highest first. Only players who received a vote appear. */
  tally: { playerId: string; count: number }[];
  /** At most one: the single most-voted player, when that player is an impostor. */
  caughtImpostorIds: string[];
  /** Impostors who were not caught. Empty when nobody voted. */
  evadedImpostorIds: string[];
  /** Voters who named any impostor, caught or not. Empty when nobody voted. */
  correctVoterIds: string[];
}

// A lone impostor is spotted almost immediately once a group gets big — with a
// dozen players the round is over before the describing is interesting. Scaling
// keeps the non-impostors a clear majority at every size.
export function impostorCountFor(playerCount: number): number {
  if (playerCount >= 15) return 3;
  if (playerCount >= 8) return 2;
  return 1;
}

export function pickImpostorIds(playerIds: string[]): string[] {
  return pickRandomSubset(playerIds, impostorCountFor(playerIds.length));
}

export function resolveRound(params: {
  votes: ImpostorVote[];
  impostorIds: string[];
}): RoundOutcome {
  const { votes, impostorIds } = params;

  const counts = new Map<string, number>();
  for (const vote of votes) {
    counts.set(vote.voted_player_id, (counts.get(vote.voted_player_id) ?? 0) + 1);
  }
  const tally = [...counts.entries()]
    .map(([playerId, count]) => ({ playerId, count }))
    .sort((a, b) => b.count - a.count);

  // A round nobody voted in pays nobody. Treating "no votes" as the impostors
  // evading would hand out IMPOSTOR_EVADED_POINTS per impostor for a round that
  // was never actually played.
  if (votes.length === 0) {
    return { tally, caughtImpostorIds: [], evadedImpostorIds: [], correctVoterIds: [] };
  }

  const topCount = tally[0].count;
  const topPlayerIds = tally.filter((t) => t.count === topCount).map((t) => t.playerId);
  // A tie means the group never settled on an accusation, so nobody is caught.
  const accusedId = topPlayerIds.length === 1 ? topPlayerIds[0] : null;

  const caughtImpostorIds =
    accusedId && impostorIds.includes(accusedId) ? [accusedId] : [];
  const evadedImpostorIds = impostorIds.filter((id) => !caughtImpostorIds.includes(id));
  const correctVoterIds = votes
    .filter((v) => impostorIds.includes(v.voted_player_id))
    .map((v) => v.voter_player_id);

  return { tally, caughtImpostorIds, evadedImpostorIds, correctVoterIds };
}
