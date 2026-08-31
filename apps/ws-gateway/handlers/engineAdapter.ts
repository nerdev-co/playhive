/**
 * Game engine adapter interface.
 *
 * Normalizes different game engines (chess, ludo, etc.) behind one contract
 * so the gateway has zero game-specific knowledge.
 */

import type { GameType } from "@playhive/protocol";

/** Opaque game state — meaningful only to the adapter that created it. */
export type GameStateData = Record<string, unknown>;

/** Normalized action sent by the client. */
export interface GameAction {
    type: string;
    [key: string]: unknown;
}

/** Result of processing an action through an adapter. */
export interface ProcessResult {
    /** Updated opaque state. */
    state: GameStateData;
    /** Events generated (for broadcasting). */
    events: unknown[];
    /** Whether the game has ended. */
    gameOver: boolean;
    /** Winner/reason if game over. */
    result?: { winner: string | null; reason: string };
}

/**
 * Every game engine must implement this interface.
 *
 * Adapters are stateless — they receive state, process it, return new state.
 * The gateway stores GameStateData per room; adapters hydrate/dehydrate as needed.
 */
export interface GameEngineAdapter {
    /** Create a fresh game. Returns opaque initial state. */
    createInitialState(options?: Record<string, unknown>): GameStateData;

    /**
     * Process an action against the given state.
     * Returns new state + events + game-over info.
     */
    processAction(
        state: GameStateData,
        action: GameAction,
        seat: number,
    ): ProcessResult;

    /** Convert opaque state to a plain object suitable for clients. */
    serializeForClient(state: GameStateData): Record<string, unknown>;
}
