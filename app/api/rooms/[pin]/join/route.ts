import { NextResponse } from 'next/server';
import { getActiveRoomByPin } from '@/core/rooms/roomService';
import { joinRoom } from '@/core/players/playerService';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ pin: string }> }
) {
  const { pin } = await params;
  const body = await request.json().catch(() => null);
  const name = body?.name;

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const room = await getActiveRoomByPin(pin);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }
  if (room.status !== 'lobby') {
    return NextResponse.json({ error: 'This room has already started' }, { status: 409 });
  }

  try {
    const { player, clientToken } = await joinRoom({ roomId: room.id, name });
    return NextResponse.json({ room, player, clientToken }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not join room';
    const status = message.includes('already taken') ? 409 : 500;
    if (status === 500) console.error('Failed to join room', err);
    return NextResponse.json({ error: message }, { status });
  }
}
