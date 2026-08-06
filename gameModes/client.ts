import { registerClientGameMode } from '@/core/gameModes/clientRegistry';
import { escapeRoomClientMode } from './escape-room/views';
import { triviaClientMode } from './trivia/views';
import { impostorClientMode } from './impostor/views';

// Client-side composition root (mirrors gameModes/index.ts on the server):
// the only file that imports a mode's actual React components, so
// host/[pin] and play/[pin] pages never import a mode's folder directly —
// they just resolve room.game_mode through the registry.
registerClientGameMode(escapeRoomClientMode);
registerClientGameMode(triviaClientMode);
registerClientGameMode(impostorClientMode);
