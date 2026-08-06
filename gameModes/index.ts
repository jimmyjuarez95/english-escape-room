import { registerGameMode } from '@/core/gameModes/registry';
import { escapeRoomMode } from './escape-room/session';
import { triviaMode } from './trivia/session';
import { impostorMode } from './impostor/session';

// Composition root: the only file that knows which game modes exist. core/
// and the API routes that call getGameMode() never change when a mode is
// added here.
registerGameMode(escapeRoomMode);
registerGameMode(triviaMode);
registerGameMode(impostorMode);
