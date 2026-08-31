/**
 * Chess adapter — wraps @playhive/chess behind the GameEngineAdapter interface.
 *
 * Uses the session API (createSession, applyActionWithSession) for pure,
 * stateless game processing. No duplicated orchestration logic.
 */

import {
    createSession as chessCreateSession,
    applyActionWithSession as chessApplyAction,
    type ChessSession,
    type EngineAction as ChessEngineAction,
} from "@playhive/chess";

import type {
    GameEngineAdapter,
    GameStateData,
    GameAction,
    ProcessResult,
} from "./engineAdapter";

/** Internal state stored per room — opaque to the gateway. */
interface ChessServerState {
    session: ChessSession;
}

function deserialize(state: GameStateData): ChessServerState {
    return state as unknown as ChessServerState;
}

function createInitialState(options?: Record<string, unknown>): GameStateData {
    const fen = (options?.fen as string) || undefined;
    const session = chessCreateSession(fen ? { fen } : undefined);
    return { session } as unknown as GameStateData;
}

function processAction(
    state: GameStateData,
    action: GameAction,
    seat: number,
): ProcessResult {
    const s = deserialize(state);
    const chessAction = action as unknown as ChessEngineAction;
    const { session: newSession, result } = chessApplyAction(s.session, chessAction, seat);

    return {
        state: { session: newSession } as unknown as GameStateData,
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
    const engine = s.session.state;
    return {
        fen: engine.fen,
        turn: engine.turn,
        moveHistory: engine.moveHistory,
        gameOver: engine.gameOver,
        result: engine.result,
        resultReason: engine.resultReason,
        fullmoveNumber: engine.fullmoveNumber,
        halfmoveClock: engine.halfmoveClock,
    };
}

export const chessAdapter: GameEngineAdapter = {
    createInitialState,
    processAction,
    serializeForClient,
};
