import type { GameModeClientDefinition } from '@/core/gameModes/clientTypes';
import EscapeRoomHostView from './host/EscapeRoomHostView';
import EscapeRoomPlayerView from './player/EscapeRoomPlayerView';

export const escapeRoomClientMode: GameModeClientDefinition = {
  id: 'escape_room',
  HostView: EscapeRoomHostView,
  PlayerView: EscapeRoomPlayerView,
};
