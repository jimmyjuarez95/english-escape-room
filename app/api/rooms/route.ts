import { NextResponse } from 'next/server';
import { createRoom } from '@/core/rooms/roomService';
import { createServiceRoleClient } from '@/core/supabase/server';
import type { CefrLevel, PlayStyle } from '@/core/supabase/types';

const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const PLAY_STYLES: PlayStyle[] = ['collaborative', 'teams'];

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const gameMode = body?.gameMode;
  const level = body?.level;
  const playStyle = body?.playStyle ?? 'collaborative';

  if (typeof gameMode !== 'string') {
    return NextResponse.json({ error: 'gameMode is required' }, { status: 400 });
  }
  if (!CEFR_LEVELS.includes(level)) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 });
  }
  if (!PLAY_STYLES.includes(playStyle)) {
    return NextResponse.json({ error: 'Invalid playStyle' }, { status: 400 });
  }

  // Validated against the game_modes catalog rather than hardcoded here, so
  // adding a future mode (trivia, impostor) never requires touching this route.
  const supabase = createServiceRoleClient();
  const { data: mode } = await supabase
    .from('game_modes')
    .select('id')
    .eq('id', gameMode)
    .eq('is_active', true)
    .maybeSingle();
  if (!mode) {
    return NextResponse.json({ error: 'Unknown game mode' }, { status: 400 });
  }

  try {
    const { room, hostSecret } = await createRoom({ gameMode, level, playStyle });
    return NextResponse.json({ room, hostSecret }, { status: 201 });
  } catch (err) {
    console.error('Failed to create room', err);
    return NextResponse.json({ error: 'Could not create room' }, { status: 500 });
  }
}
