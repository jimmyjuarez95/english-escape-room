import { createServiceRoleClient } from '../supabase/server';
import { pickRandomSubset } from '../random/pickRandomSubset';
import type { Team } from '../supabase/types';

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

/**
 * Authenticates a player *for a specific room*. The room scoping is the point:
 * a token proves "I am this player", not "this player belongs here", so without
 * the room_id check a player holding a valid token for room X could act inside
 * any room Y whose PIN they knew — submitting answers, reading impostor roles,
 * or voting there.
 *
 * Returns the player's team as well, so callers never have to take it from the
 * request body (which let a player drive the opposing team's session).
 */
export async function verifyPlayerInRoom(
  roomId: string,
  playerId: string,
  clientToken: string
): Promise<{ ok: true; team: Team } | { ok: false; team: null }> {
  const supabase = createServiceRoleClient();
  // Two plain queries rather than a PostgREST embed: core/supabase/types.ts
  // declares Relationships: [] on every table, so an embedded select does not
  // type-check against the generated Database type.
  const [{ data: player }, { data: token }] = await Promise.all([
    supabase.from('players').select('team').eq('id', playerId).eq('room_id', roomId).maybeSingle(),
    supabase.from('player_tokens').select('client_token').eq('player_id', playerId).maybeSingle(),
  ]);

  if (!player || !token || token.client_token !== clientToken) {
    return { ok: false, team: null };
  }
  return { ok: true, team: player.team };
}

export async function assignRandomTeams(roomId: string) {
  const supabase = createServiceRoleClient();
  const { data: players, error } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', roomId);
  if (error) throw error;
  if (!players || players.length === 0) return;

  // Fisher-Yates via the shared helper: sort(() => Math.random() - 0.5) is a
  // biased shuffle, and an unfair split is exactly what it biases towards.
  const shuffled = pickRandomSubset(players, players.length);
  await Promise.all(
    shuffled.map((player, index) =>
      supabase
        .from('players')
        .update({ team: index % 2 === 0 ? 'A' : 'B' })
        .eq('id', player.id)
    )
  );
}
