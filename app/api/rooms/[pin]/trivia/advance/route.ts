import { NextResponse } from 'next/server';
import { getActiveRoomByPin, verifyHostSecret } from '@/core/rooms/roomService';
import { createServiceRoleClient } from '@/core/supabase/server';

// Host-paced state machine: 'question' -> 'reveal' (just flips the phase so
// everyone sees the correct answer), then 'reveal' -> next question or, if
// none remain, the room finishes. Each transition is a conditional update
// keyed on the phase it expects, so a double-tap on the button no-ops
// instead of skipping two questions at once.
export async function POST(request: Request, { params }: { params: Promise<{ pin: string }> }) {
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
  if (room.status !== 'in_progress') {
    return NextResponse.json({ error: 'This room is not in progress' }, { status: 409 });
  }

  const isHost = await verifyHostSecret(room.id, hostSecret);
  if (!isHost) {
    return NextResponse.json({ error: 'Invalid host secret' }, { status: 403 });
  }

  const supabase = createServiceRoleClient();
  const { data: session, error: sessionError } = await supabase
    .from('trivia_sessions')
    .select()
    .eq('room_id', room.id)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) {
    return NextResponse.json({ error: 'No trivia session for this room' }, { status: 409 });
  }

  if (session.phase === 'question') {
    const { error } = await supabase
      .from('trivia_sessions')
      .update({ phase: 'reveal' })
      .eq('room_id', room.id)
      .eq('phase', 'question');
    if (error) throw error;
    return NextResponse.json({ ok: true });
  }

  // question_sequence is the short, randomly-sampled subset of the (much
  // larger) track chosen once at onStart — see gameModes/trivia/session.ts
  // — so "next question" is an array lookup, not a query by order_index.
  const nextQuestionId = session.question_sequence[session.current_index + 1];
  const { data: nextQuestion, error: nextError } = nextQuestionId
    ? await supabase
        .from('trivia_questions')
        .select('id, time_limit_seconds')
        .eq('id', nextQuestionId)
        .maybeSingle()
    : { data: null, error: null };
  if (nextError) throw nextError;

  if (nextQuestion) {
    const deadline = new Date(Date.now() + nextQuestion.time_limit_seconds * 1000).toISOString();
    const { error } = await supabase
      .from('trivia_sessions')
      .update({
        current_index: session.current_index + 1,
        current_question_id: nextQuestion.id,
        phase: 'question',
        question_deadline: deadline,
      })
      .eq('room_id', room.id)
      .eq('phase', 'reveal');
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('trivia_sessions')
      .update({ finished_at: new Date().toISOString() })
      .eq('room_id', room.id)
      .eq('phase', 'reveal');
    if (error) throw error;

    const { error: roomError } = await supabase
      .from('rooms')
      .update({ status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', room.id);
    if (roomError) throw roomError;
  }

  return NextResponse.json({ ok: true });
}
