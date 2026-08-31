/**
 * Ludo adapter — wraps @playhive/ludo behind the GameEngineAdapter interface.
 *
 * Server-authoritative dice: ROLL_DICE generates a random value stored in
 * the session. MOVE_TOKEN validates against the stored value.
 * No client-supplied distance is trusted.
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
    const session = { ...s.session };

    // --- ROLL_DICE: server generates the dice value ---
    if (action.type === "ROLL_DICE") {
        const distance = Math.floor(Math.random() * 6) + 1;
        session.pendingDistance = distance;

        return {
            state: { session } as unknown as GameStateData,
            events: [{ type: "dice", value: distance, seat }],
            gameOver: false,
        };
    }

    // --- MOVE_TOKEN: validate against server-generated dice ---
    if (action.type === "MOVE_TOKEN") {
        const clientDistance = action.distance as number | undefined;
        const token = action.token as number | undefined;

        if (token === undefined) {
            return {
                state: { session } as unknown as GameStateData,
                events: [],
                gameOver: false,
            };
        }

        // Must have a pending dice roll
        if (session.pendingDistance === undefined) {
            return {
                state: { session } as unknown as GameStateData,
                events: [],
                gameOver: false,
            };
        }

        // Validate dice value matches
        if (clientDistance !== undefined && clientDistance !== session.pendingDistance) {
            return {
                state: { session } as unknown as GameStateData,
                events: [],
                gameOver: false,
            };
        }

        // Use the server-generated distance, clear pending
        const distance = session.pendingDistance;
        session.pendingDistance = undefined;

        const ludoAction: LudoEngineAction = {
            type: "MOVE_TOKEN",
            token,
            distance,
        };

        const { session: newSession, result } = ludoProcessAction(
            session,
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

    // --- Unknown action ---
    return {
        state: { session } as unknown as GameStateData,
        events: [],
        gameOver: false,
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
        pendingDistance: session.pendingDistance,
    };
}

export const ludoAdapter: GameEngineAdapter = {
    createInitialState,
    processAction,
    serializeForClient,
};
