import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/core/supabase/server';
import type { ResultsData } from '@/core/results/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pin: string }> }
) {
  const { pin } = await params;
  const supabase = createServiceRoleClient();

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select()
    .eq('pin', pin)
    .maybeSingle();
  if (roomError || !room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  if (room.status !== 'finished') {
    return NextResponse.json({ error: 'This room has not finished yet' }, { status: 409 });
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select()
    .eq('room_id', room.id)
    .order('score', { ascending: false });
  if (playersError) throw playersError;

  const teamTotals =
    room.play_style === 'teams'
      ? (['A', 'B'] as const).map((team) => ({
          team,
          score: (players ?? [])
            .filter((p) => p.team === team)
            .reduce((sum, p) => sum + p.score, 0),
        }))
      : null;

  const { data: wrongAttempts } = await supabase
    .from('attempts')
    .select('grammar_point')
    .eq('room_id', room.id)
    .eq('is_correct', false)
    .not('grammar_point', 'is', null);

  const mistakeCounts = new Map<string, number>();
  for (const attempt of wrongAttempts ?? []) {
    if (!attempt.grammar_point) continue;
    mistakeCounts.set(attempt.grammar_point, (mistakeCounts.get(attempt.grammar_point) ?? 0) + 1);
  }
  const topMistakePoints = [...mistakeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([grammarPoint]) => grammarPoint);

  let commonMistakes: ResultsData['commonMistakes'] = [];
  if (topMistakePoints.length > 0) {
    const { data: explanationRows } = await supabase
      .from('escape_room_challenges')
      .select('grammar_point, explanation')
      .in('grammar_point', topMistakePoints);

    const explanationByPoint = new Map(
      (explanationRows ?? []).map((row) => [row.grammar_point, row.explanation])
    );
    commonMistakes = topMistakePoints.map((grammarPoint) => ({
      grammarPoint,
      count: mistakeCounts.get(grammarPoint)!,
      explanation: explanationByPoint.get(grammarPoint) ?? '',
    }));
  }

  const totalTimeSeconds =
    room.started_at && room.finished_at
      ? Math.round(
          (new Date(room.finished_at).getTime() - new Date(room.started_at).getTime()) / 1000
        )
      : null;

  const results: ResultsData = {
    players: (players ?? []).map((p) => ({ id: p.id, name: p.name, team: p.team, score: p.score })),
    teamTotals,
    totalTimeSeconds,
    commonMistakes,
  };

  return NextResponse.json(results);
}
