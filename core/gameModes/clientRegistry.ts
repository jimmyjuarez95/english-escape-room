import type { GameModeClientDefinition } from './clientTypes';

const registry = new Map<string, GameModeClientDefinition>();

export function registerClientGameMode(mode: GameModeClientDefinition) {
  registry.set(mode.id, mode);
}

export function getClientGameMode(id: string): GameModeClientDefinition | undefined {
  return registry.get(id);
}
