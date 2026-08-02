import { createServiceRoleClient } from '../supabase/server';
import { generatePin } from './pin';
import type { CefrLevel, PlayStyle } from '../supabase/types';

const UNIQUE_VIOLATION = '23505';
const MAX_PIN_ATTEMPTS = 10;

export async function createRoom(params: {
  gameMode: string;
  level: CefrLevel;
  playStyle: PlayStyle;
}) {
  const supabase = createServiceRoleClient();

  for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt++) {
    const pin = generatePin();
    const { data: room, error } = await supabase
      .from('rooms')
      .insert({
        pin,
        game_mode: params.gameMode,
        level: params.level,
        play_style: params.playStyle,
      })
      .select()
      .single();

    if (error) {
      // Collision on the active-PIN partial unique index -> try a new PIN.
      if (error.code === UNIQUE_VIOLATION) continue;
      throw error;
    }

    const { data: hostRow, error: hostError } = await supabase
      .from('room_hosts')
      .insert({ room_id: room.id })
      .select('host_secret')
      .single();
    if (hostError) throw hostError;

    return { room, hostSecret: hostRow.host_secret };
  }

  throw new Error('Could not generate a unique room PIN after multiple attempts');
}

export async function getActiveRoomByPin(pin: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('rooms')
    .select()
    .eq('pin', pin)
    .neq('status', 'finished')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function verifyHostSecret(roomId: string, hostSecret: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('room_hosts')
    .select('host_secret')
    .eq('room_id', roomId)
    .maybeSingle();
  return !!data && data.host_secret === hostSecret;
}
