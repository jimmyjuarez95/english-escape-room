import type { Database } from '../supabase/types';

type Room = Database['public']['Tables']['rooms']['Row'];

// Server-side half of the plug-in interface (room lifecycle hooks). Kept
// separate from clientTypes.ts's GameModeClientDefinition (React views) so
// this can be imported from API routes without ever pulling client
// components — and vice versa — into the wrong bundle.
export interface GameModeServerDefinition {
  id: string;
  /** Called once, when the host starts the game: sets up whatever
   * mode-specific state a room needs (e.g. escape-room's session rows). */
  onStart(room: Room): Promise<void>;
}
