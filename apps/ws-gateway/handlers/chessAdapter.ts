/**
 * Chess adapter — wraps @playhive/chess behind the GameEngineAdapter interface.
 *
 * Delegates to pure functions (parseFEN, makeMove, generateMoves, etc.)
 * No module-level state; each call receives and returns opaque state.
 */

import {
    parseFEN,
    START_FEN,
    makeMove,
    generateMoves,
    isInCheck,
    moveToSAN,
    computeHash,
    fenToBoard,
    RepetitionTable,
    checkGameOver,
} from "@playhive/chess";
import type { EngineState, ChessMove, ChessEvent } from "@playhive/chess";

import type {
    GameEngineAdapter,
    GameStateData,
    GameAction,
    ProcessResult,
} from "./engineAdapter";

/** Internal state stored per room — opaque to the gateway. */
interface ChessServerState {
    engine: EngineState;
    pendingDrawOffer: "white" | "black" | null;
    repetitionData: [number, number][];
}

function deserialize(state: GameStateData): ChessServerState {
    return state as unknown as ChessServerState;
}

function createInitialState(options?: Record<string, unknown>): GameStateData {
    const fen = (options?.fen as string) || START_FEN;
    const engine = parseFEN(fen);
    const rep = new RepetitionTable();
    const board = fenToBoard(engine.fen);
    const hash = computeHash(
        board,
        engine.turn,
        engine.castling,
        engine.enPassant,
    );
    rep.add(hash);

    return {
        engine,
        pendingDrawOffer: null,
        repetitionData: rep.serialize(),
    } as unknown as GameStateData;
}

function processAction(
    state: GameStateData,
    action: GameAction,
    _seat: number,
): ProcessResult {
    const s = deserialize(state);
    const rep = RepetitionTable.deserialize(s.repetitionData);
    const events: ChessEvent[] = [];
    let engine = { ...s.engine };
    let pendingDrawOffer = s.pendingDrawOffer;

    if (action.type === "RESIGN") {
        const winner = engine.turn === "white" ? "black" : "white";
        engine.gameOver = true;
        engine.result = winner;
        engine.resultReason = "resignation";
        events.push({ type: "resign", winner, fen: engine.fen });

        return {
            state: {
                engine,
                pendingDrawOffer: null,
                repetitionData: rep.serialize(),
            } as unknown as GameStateData,
            events,
            gameOver: true,
            result: { winner, reason: "resignation" },
        };
    }

    if (action.type === "DRAW_OFFER") {
        pendingDrawOffer = engine.turn;
        events.push({
            type: "draw_offer",
            offeredBy: engine.turn,
            fen: engine.fen,
        });

        return {
            state: {
                engine,
                pendingDrawOffer,
                repetitionData: rep.serialize(),
            } as unknown as GameStateData,
            events,
            gameOver: false,
        };
    }

    if (action.type === "DRAW_ACCEPT") {
        if (pendingDrawOffer && pendingDrawOffer !== engine.turn) {
            engine.gameOver = true;
            engine.result = "draw";
            engine.resultReason = "agreement";
            events.push({ type: "draw_accept", fen: engine.fen });
            events.push({ type: "draw", reason: "agreement", fen: engine.fen });
            pendingDrawOffer = null;
        }

        return {
            state: {
                engine,
                pendingDrawOffer,
                repetitionData: rep.serialize(),
            } as unknown as GameStateData,
            events,
            gameOver: engine.gameOver,
            result: engine.gameOver
                ? { winner: "draw", reason: "agreement" }
                : undefined,
        };
    }

    if (action.type === "DRAW_DECLINE") {
        if (pendingDrawOffer && pendingDrawOffer !== engine.turn) {
            events.push({ type: "draw_decline", fen: engine.fen });
            pendingDrawOffer = null;
        }

        return {
            state: {
                engine,
                pendingDrawOffer,
                repetitionData: rep.serialize(),
            } as unknown as GameStateData,
            events,
            gameOver: false,
        };
    }

    if (action.type === "MOVE") {
        const move: ChessMove = {
            from: action.from as string,
            to: action.to as string,
            promotion: action.promotion as ChessMove["promotion"],
        };

        const legalMovesGroups = generateMoves(engine);
        const isLegal = legalMovesGroups.some((g) =>
            g.moves.some(
                (m) =>
                    m.from === move.from &&
                    m.to === move.to &&
                    m.promotion === move.promotion,
            ),
        );

        if (!isLegal) {
            return {
                state: {
                    engine,
                    pendingDrawOffer,
                    repetitionData: rep.serialize(),
                } as unknown as GameStateData,
                events: [],
                gameOver: false,
            };
        }

        const prevTurn = engine.turn;
        const san = moveToSAN(engine, move);

        engine = makeMove(engine, move);

        const historyEntry = engine.moveHistory[engine.moveHistory.length - 1];
        const givesCheck = isInCheck(engine);
        if (historyEntry) {
            historyEntry.san = san;
            historyEntry.check = givesCheck;
        }

        const moveEvent: ChessEvent = {
            type: "move",
            move: {
                from: action.from as string,
                to: action.to as string,
                promotion: action.promotion as ChessMove["promotion"],
                san,
                capture: historyEntry?.capture ?? false,
                check: givesCheck,
                checkmate: false,
            },
            fen: engine.fen,
            turn: engine.turn,
        };
        events.push(moveEvent);

        const board = fenToBoard(engine.fen);
        const hash = computeHash(
            board,
            engine.turn,
            engine.castling,
            engine.enPassant,
        );
        rep.add(hash);

        if (givesCheck) {
            events.push({ type: "check", fen: engine.fen });
            const over = checkGameOver(engine);
            if (over.gameOver) {
                engine.gameOver = true;
                engine.result = over.result;
                engine.resultReason = over.resultReason;
                moveEvent.move.checkmate = over.resultReason === "checkmate";
                if (historyEntry)
                    historyEntry.checkmate = moveEvent.move.checkmate;
                events.push({
                    type: "checkmate",
                    winner: prevTurn,
                    fen: engine.fen,
                });
            }
        } else {
            const over = checkGameOver(engine);
            if (over.gameOver) {
                engine.gameOver = true;
                engine.result = over.result;
                engine.resultReason = over.resultReason;
                if (over.resultReason === "stalemate") {
                    events.push({ type: "stalemate", fen: engine.fen });
                } else {
                    events.push({
                        type: "draw",
                        reason: (over.resultReason ??
                            "draw") as ChessEvent extends {
                            type: "draw";
                            reason: infer R;
                        }
                            ? R
                            : never,
                        fen: engine.fen,
                    });
                }
            }
        }

        if (rep.getCount(hash) >= 5) {
            engine.gameOver = true;
            engine.result = "draw";
            engine.resultReason = "fivefold_repetition";
            events.push({
                type: "draw",
                reason: "fivefold_repetition",
                fen: engine.fen,
            });
        }

        pendingDrawOffer = null;

        return {
            state: {
                engine,
                pendingDrawOffer,
                repetitionData: rep.serialize(),
            } as unknown as GameStateData,
            events,
            gameOver: engine.gameOver,
            result: engine.gameOver
                ? {
                      winner: engine.result || "draw",
                      reason: engine.resultReason || "draw",
                  }
                : undefined,
        };
    }

    return {
        state: {
            engine,
            pendingDrawOffer,
            repetitionData: rep.serialize(),
        } as unknown as GameStateData,
        events,
        gameOver: false,
    };
}

function serializeForClient(state: GameStateData): Record<string, unknown> {
    const s = deserialize(state);
    return {
        fen: s.engine.fen,
        turn: s.engine.turn,
        moveHistory: s.engine.moveHistory,
        gameOver: s.engine.gameOver,
        result: s.engine.result,
        resultReason: s.engine.resultReason,
        fullmoveNumber: s.engine.fullmoveNumber,
        halfmoveClock: s.engine.halfmoveClock,
    };
}

export const chessAdapter: GameEngineAdapter = {
    createInitialState,
    processAction,
    serializeForClient,
};
