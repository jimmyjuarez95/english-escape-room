import { createServiceRoleClient } from '../supabase/server';

const UNIQUE_VIOLATION = '23505';
const MAX_NAME_LENGTH = 30;

export async function joinRoom(params: { roomId: string; name: string }) {
  const name = params.name.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) throw new Error('Name is required');

  const supabase = createServiceRoleClient();
  const { data: player, error } = await supabase
    .from('players')
    .insert({ room_id: params.roomId, name })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new Error('That name is already taken in this room');
    }
    throw error;
  }

  const { data: tokenRow, error: tokenError } = await supabase
    .from('player_tokens')
    .insert({ player_id: player.id })
    .select('client_token')
    .single();
  if (tokenError) throw tokenError;

  return { player, clientToken: tokenRow.client_token };
}

export async function verifyClientToken(playerId: string, clientToken: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from('player_tokens')
    .select('client_token')
    .eq('player_id', playerId)
    .maybeSingle();
  return !!data && data.client_token === clientToken;
}

export async function assignRandomTeams(roomId: string) {
  const supabase = createServiceRoleClient();
  const { data: players, error } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', roomId);
  if (error) throw error;
  if (!players || players.length === 0) return;

  const shuffled = [...players].sort(() => Math.random() - 0.5);
  await Promise.all(
    shuffled.map((player, index) =>
      supabase
        .from('players')
        .update({ team: index % 2 === 0 ? 'A' : 'B' })
        .eq('id', player.id)
    )
  );
}
