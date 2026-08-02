import { registerGameMode } from '@/core/gameModes/registry';
import { escapeRoomMode } from './escape-room/session';

// Composition root: the only file that knows which game modes exist. Adding
// trivia/impostor later is one more import + registerGameMode call here —
// core/ and the API routes that call getGameMode() never change.
registerGameMode(escapeRoomMode);
