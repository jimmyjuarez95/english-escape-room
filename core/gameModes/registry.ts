import type { GameModeServerDefinition } from './types';

// Populated by gameModes/index.ts (the composition root), never by core
// itself — core knows the shape of a game mode, never which ones exist.
const registry = new Map<string, GameModeServerDefinition>();

export function registerGameMode(mode: GameModeServerDefinition) {
  registry.set(mode.id, mode);
}

export function getGameMode(id: string): GameModeServerDefinition | undefined {
  return registry.get(id);
}
