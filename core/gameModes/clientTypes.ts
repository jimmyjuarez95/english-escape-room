import type { ComponentType } from 'react';
import type { Database } from '../supabase/types';

type Room = Database['public']['Tables']['rooms']['Row'];
type Player = Database['public']['Tables']['players']['Row'];

export interface StoredPlayer {
  playerId: string;
  clientToken: string;
  name: string;
}

// Client-side half of the plug-in interface (gameplay screens). Kept
// separate from core/gameModes/types.ts's GameModeServerDefinition so that
// importing a mode's React views never pulls server-only code (service role
// client, onStart) into the browser bundle, and vice versa.
export interface GameModeClientDefinition {
  id: string;
  HostView: ComponentType<{ room: Room; players: Player[] }>;
  PlayerView: ComponentType<{ room: Room; player: StoredPlayer }>;
}
