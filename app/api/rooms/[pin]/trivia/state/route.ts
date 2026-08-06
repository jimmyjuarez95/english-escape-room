import { NextResponse } from 'next/server';
import { getActiveRoomByPin } from '@/core/rooms/roomService';
import { createServiceRoleClient } from '@/core/supabase/server';

// The only read path for trivia question content: correct_index/explanation
// are only ever included once the room's phase is 'reveal', which a static
// public view can't express (trivia_questions carries no anon policy at all).
export async function GET(request: Request, { params }: { params: Promise<{ pin: string }> }) {
  const { pin } = await params;

  const room = await getActiveRoomByPin(pin);
  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 });
  }

  const supabase = createServiceRoleClient();
  const { data: session, error: sessionError } = await supabase
    .from('trivia_sessions')
    .select()
    .eq('room_id', room.id)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) {
    return NextResponse.json({ session: null, question: null, reveal: null });
  }

  let question = null;
  let reveal = null;
  if (session.current_question_id) {
    const { data: questionRow, error: questionError } = await supabase
      .from('trivia_questions')
      .select('id, question, options, correct_index, explanation, time_limit_seconds')
      .eq('id', session.current_question_id)
      .maybeSingle();
    if (questionError) throw questionError;
    if (questionRow) {
      question = {
        id: questionRow.id,
        question: questionRow.question,
        options: questionRow.options,
        timeLimitSeconds: questionRow.time_limit_seconds,
      };
      if (session.phase === 'reveal') {
        reveal = { correctIndex: questionRow.correct_index, explanation: questionRow.explanation };
      }
    }
  }

  return NextResponse.json({
    session: {
      currentIndex: session.current_index,
      phase: session.phase,
      questionDeadline: session.question_deadline,
      finishedAt: session.finished_at,
    },
    question,
    reveal,
  });
}
