import type { GameModeClientDefinition } from '@/core/gameModes/clientTypes';
import TriviaHostView from './host/TriviaHostView';
import TriviaPlayerView from './player/TriviaPlayerView';

export const triviaClientMode: GameModeClientDefinition = {
  id: 'trivia',
  HostView: TriviaHostView,
  PlayerView: TriviaPlayerView,
};
