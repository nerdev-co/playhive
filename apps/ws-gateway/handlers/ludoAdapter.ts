/**
 * Ludo adapter — wraps @playhive/ludo behind the GameEngineAdapter interface.
 *
 * The ludo engine uses module-level globals (BOARD, PIECES, PLAYERS, etc.).
 * To process an action for a specific game, we hydrate globals from stored state,
 * run the action, then capture the new state.
 *
 * Limitation: only one ludo game can be active at a time.
 * This is acceptable for the in-memory stage; Redis-backed isolation comes later.
 */

import {
    initGame as ludoInitGame,
    applyAction as ludoApplyAction,
    getEngineState,
    createInitialState as ludoCreateInitialState,
} from "@playhive/ludo";
import type {
    EngineState as LudoEngineState,
    EngineAction as LudoEngineAction,
} from "@playhive/ludo";

import type {
    GameEngineAdapter,
    GameStateData,
    GameAction,
    ProcessResult,
} from "./engineAdapter";

function deserialize(state: GameStateData): LudoEngineState {
    return state as unknown as LudoEngineState;
}

function createInitialState(options?: Record<string, unknown>): GameStateData {
    const ludoOptions = {
        position: (options?.position as string) || "abcd//abcd/ a aa",
        openWith: (options?.openWith as number[]) || [6],
        canRound: (options?.canRound as boolean) || false,
        capture: (options?.capture as boolean) || false,
        historySize: (options?.historySize as number) || 0,
    };

    const state = ludoCreateInitialState(ludoOptions);
    return state as unknown as GameStateData;
}

function processAction(
    state: GameStateData,
    action: GameAction,
    seat: number,
): ProcessResult {
    const s = deserialize(state);

    // Hydrate engine globals from stored state
    // resetInit() clears all globals, then initGame() restores from position + history
    const error = ludoInitGame({
        position: s.position,
        state: s.history,
        openWith: s.config?.openWith,
        canRound: s.config?.canRound,
        capture: s.config?.capture,
        historySize: s.config?.historySize,
    });

    if (error) {
        return {
            state,
            events: [],
            gameOver: false,
        };
    }

    // Process action through the engine (reads/writes globals)
    const ludoAction: LudoEngineAction = {
        type: action.type as LudoEngineAction["type"],
        token: action.token as number | undefined,
        from: action.from as number | undefined,
        to: action.to as number | undefined,
        distance: action.distance as number | undefined,
    };

    const result = ludoApplyAction(ludoAction);

    // Capture new state from globals
    const newState = getEngineState();

    return {
        state: newState as unknown as GameStateData,
        events: result.events,
        gameOver: result.gameOver,
        result: result.result
            ? {
                  winner: result.result.winner,
                  reason: result.result.reason,
              }
            : undefined,
    };
}

function serializeForClient(state: GameStateData): Record<string, unknown> {
    const s = deserialize(state);
    return {
        position: s.position,
        history: s.history,
        turn: s.turn,
        players: s.players,
        playersWithEnds: s.playersWithEnds,
        captured: s.captured,
        pieces: s.pieces,
        board: s.board,
        gameInfo: s.gameInfo,
        gameOver: s.gameOver,
        winner: s.winner,
        ranks: s.ranks,
    };
}

export const ludoAdapter: GameEngineAdapter = {
    createInitialState,
    processAction,
    serializeForClient,
};
