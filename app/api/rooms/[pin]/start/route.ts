import { NextResponse } from 'next/server';
import '@/gameModes'; // side-effect: registers escape_room (and future modes)
import { getActiveRoomByPin, verifyHostSecret } from '@/core/rooms/roomService';
import { assignRandomTeams } from '@/core/players/playerService';
import { getGameMode } from '@/core/gameModes/registry';
import { createServiceRoleClient } from '@/core/supabase/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pin: string }> }
) {
  const { pin } = await params;
  const body = await request.json().catch(() => null);
  const hostSecret = body?.hostSecret;

  if (typeof hostSecret !== 'string') {
    return NextResponse.json({ error: 'hostSecret is required' }, { status: 400 });
  }

  const room = await getActiveRoomByPin(pin);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  if (room.status !== 'lobby') {
    return NextResponse.json({ error: 'This room already started' }, { status: 409 });
  }

  const isHost = await verifyHostSecret(room.id, hostSecret);
  if (!isHost) {
    return NextResponse.json({ error: 'Invalid host secret' }, { status: 403 });
  }

  const mode = getGameMode(room.game_mode);
  if (!mode) {
    return NextResponse.json({ error: 'Unknown game mode' }, { status: 500 });
  }

  try {
    if (room.play_style === 'teams') {
      await assignRandomTeams(room.id);
    }
    await mode.onStart(room);

    const supabase = createServiceRoleClient();
    const { data: updatedRoom, error } = await supabase
      .from('rooms')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', room.id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ room: updatedRoom });
  } catch (err) {
    console.error('Failed to start room', err);
    const message = err instanceof Error ? err.message : 'Could not start the game';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
