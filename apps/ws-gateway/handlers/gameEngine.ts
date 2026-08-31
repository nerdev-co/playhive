/**
 * Game engine registry.
 *
 * Registers adapters for each game type and exposes a unified interface
 * that the gateway calls. Zero game-specific knowledge here.
 */

import type { GameType } from "@playhive/protocol";

import type {
    GameEngineAdapter,
    GameStateData,
    GameAction,
    ProcessResult,
} from "./engineAdapter";
import { chessAdapter } from "./chessAdapter";
import { ludoAdapter } from "./ludoAdapter";

// Re-export types the gateway needs
export type {
    GameStateData,
    GameAction,
    ProcessResult,
} from "./engineAdapter";

const adapters = new Map<GameType, GameEngineAdapter>();

adapters.set("chess", chessAdapter);
adapters.set("ludo", ludoAdapter);

export function getAdapter(gameType: GameType): GameEngineAdapter | undefined {
    return adapters.get(gameType);
}

export function createServerGameState(
    gameType: GameType,
    options?: Record<string, unknown>,
): GameStateData | undefined {
    const adapter = adapters.get(gameType);
    if (!adapter) return undefined;
    return adapter.createInitialState(options);
}

export function processGameAction(
    gameType: GameType,
    state: GameStateData,
    action: GameAction,
    seat: number,
): ProcessResult | undefined {
    const adapter = adapters.get(gameType);
    if (!adapter) return undefined;
    return adapter.processAction(state, action, seat);
}

export function serializeGameState(
    gameType: GameType,
    state: GameStateData,
): Record<string, unknown> | undefined {
    const adapter = adapters.get(gameType);
    if (!adapter) return undefined;
    return adapter.serializeForClient(state);
}
