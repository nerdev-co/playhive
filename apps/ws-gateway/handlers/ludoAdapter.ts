/**
 * Ludo adapter — wraps @playhive/ludo behind the GameEngineAdapter interface.
 *
 * Uses the session API (createSession, processActionWithSession) for pure,
 * stateless game processing. No global hydration needed — each call receives
 * and returns a LudoSession that captures all mutable state.
 */

import {
    createSession as ludoCreateSession,
    processActionWithSession as ludoProcessAction,
} from "@playhive/ludo";
import type {
    LudoSession,
    EngineAction as LudoEngineAction,
} from "@playhive/ludo";

import type {
    GameEngineAdapter,
    GameStateData,
    GameAction,
    ProcessResult,
} from "./engineAdapter";

/** Internal state stored per room — opaque to the gateway. */
interface LudoServerState {
    session: LudoSession;
}

function deserialize(state: GameStateData): LudoServerState {
    return state as unknown as LudoServerState;
}

function createInitialState(options?: Record<string, unknown>): GameStateData {
    const ludoOptions = {
        position: (options?.position as string) || "abcd//abcd/ a aa",
        openWith: (options?.openWith as number[]) || [6],
        canRound: (options?.canRound as boolean) || false,
        capture: (options?.capture as boolean) || false,
        historySize: (options?.historySize as number) || 0,
    };

    const session = ludoCreateSession(ludoOptions);
    return { session } as unknown as GameStateData;
}

function processAction(
    state: GameStateData,
    action: GameAction,
    seat: number,
): ProcessResult {
    const s = deserialize(state);

    const ludoAction: LudoEngineAction = {
        type: action.type as LudoEngineAction["type"],
        token: action.token as number | undefined,
        from: action.from as number | undefined,
        to: action.to as number | undefined,
        distance: action.distance as number | undefined,
    };

    const { session: newSession, result } = ludoProcessAction(
        s.session,
        ludoAction,
    );

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
    const session = s.session;
    const gameOver = session.players.length === 1;

    return {
        players: session.players,
        playersWithEnds: session.playersWithEnds,
        captured: session.captured,
        pieces: session.pieces,
        board: session.board,
        gameInfo: session.gameInfo,
        turn: session.players[session.gameInfo[0]],
        gameOver,
        winner: gameOver ? session.players[0] : undefined,
        ranks: gameOver
            ? [...session.playersWithEnds, session.players[0]]
            : undefined,
    };
}

export const ludoAdapter: GameEngineAdapter = {
    createInitialState,
    processAction,
    serializeForClient,
};
