import type { Database } from '../supabase/types';

type Room = Database['public']['Tables']['rooms']['Row'];

// Server-side half of the plug-in interface (room lifecycle hooks). Kept
// separate from clientTypes.ts's GameModeClientDefinition (React views) so
// this can be imported from API routes without ever pulling client
// components — and vice versa — into the wrong bundle.
export interface GameModeServerDefinition {
  id: string;
  /** Smallest roster the mode can be played with. Declared here rather than
   * checked inside onStart so /start can reject early with a 409 the host can
   * act on, and so the lobby can disable the button instead of letting the
   * host discover the rule by hitting a 500. */
  minPlayers?: number;
  /** Called once, when the host starts the game: sets up whatever
   * mode-specific state a room needs (e.g. escape-room's session rows). */
  onStart(room: Room): Promise<void>;
}
