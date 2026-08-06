import type { GameModeClientDefinition } from '@/core/gameModes/clientTypes';
import ImpostorHostView from './host/ImpostorHostView';
import ImpostorPlayerView from './player/ImpostorPlayerView';

export const impostorClientMode: GameModeClientDefinition = {
  id: 'impostor',
  HostView: ImpostorHostView,
  PlayerView: ImpostorPlayerView,
};
