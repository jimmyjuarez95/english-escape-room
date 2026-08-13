import type { GameModeClientDefinition } from '@/core/gameModes/clientTypes';
import { IMPOSTOR_MIN_PLAYERS } from './rules';
import ImpostorHostView from './host/ImpostorHostView';
import ImpostorPlayerView from './player/ImpostorPlayerView';

export const impostorClientMode: GameModeClientDefinition = {
  id: 'impostor',
  minPlayers: IMPOSTOR_MIN_PLAYERS,
  HostView: ImpostorHostView,
  PlayerView: ImpostorPlayerView,
};
