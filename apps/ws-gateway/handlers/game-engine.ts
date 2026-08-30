/**
 * Server-side game engine processor.
 *
 * Uses pure functions from @repo/chess — no module-level state.
 * Each room gets its own GameStateStore instance.
 */

import {
    parseFEN,
    START_FEN,
    makeMove,
    generateLegalMoves,
    isInCheck,
    moveToSAN,
    computeHash,
    fenToBoard,
    RepetitionTable,
    checkGameOver,
} from "@repo/chess";
import type { EngineState, EngineAction, ChessMove, EngineResult, ChessEvent } from "@repo/chess";

/** Serializable game state that can be stored and sent over the wire. */
export interface ServerGameState {
    engine: EngineState;
    pendingDrawOffer: "white" | "black" | null;
    repetitionHashes: [number, number][];
}

/** Result of processing a game action. */
export interface ProcessResult {
    state: ServerGameState;
    events: ChessEvent[];
    gameOver: boolean;
    result?: { winner: string; reason: string };
}

/**
 * Creates a fresh game state from a FEN string.
 */
export function createServerGameState(fen?: string): ServerGameState {
    const engine = parseFEN(fen || START_FEN);
    const rep = new RepetitionTable();
    const board = fenToBoard(engine.fen);
    const hash = computeHash(board, engine.turn, engine.castling, engine.enPassant);
    rep.add(hash);

    return {
        engine,
        pendingDrawOffer: null,
        repetitionHashes: Array.from(rep["positions"].entries()),
    };
}

/**
 * Processes a game action through the chess engine.
 * Returns the new state and any events generated.
 */
export function processAction(state: ServerGameState, action: EngineAction, seat: number): ProcessResult {
    // Reconstruct repetition table from stored hashes
    const rep = new RepetitionTable();
    for (const [hash, count] of state.repetitionHashes) {
        for (let i = 0; i < count; i++) rep.add(hash);
    }

    const events: ChessEvent[] = [];
    let engine = { ...state.engine };
    let pendingDrawOffer = state.pendingDrawOffer;

    // Handle resign
    if (action.type === "RESIGN") {
        const winner = engine.turn === "white" ? "black" : "white";
        engine.gameOver = true;
        engine.result = winner;
        engine.resultReason = "resignation";
        events.push({ type: "resign", winner, fen: engine.fen });

        return {
            state: { engine, pendingDrawOffer: null, repetitionHashes: Array.from(rep["positions"].entries()) },
            events,
            gameOver: true,
            result: { winner, reason: "resignation" },
        };
    }

    // Handle draw offer
    if (action.type === "DRAW_OFFER") {
        pendingDrawOffer = engine.turn;
        events.push({ type: "draw_offer", offeredBy: engine.turn, fen: engine.fen });

        return {
            state: { engine, pendingDrawOffer, repetitionHashes: Array.from(rep["positions"].entries()) },
            events,
            gameOver: false,
        };
    }

    // Handle draw accept
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
            state: { engine, pendingDrawOffer, repetitionHashes: Array.from(rep["positions"].entries()) },
            events,
            gameOver: engine.gameOver,
            result: engine.gameOver ? { winner: "draw", reason: "agreement" } : undefined,
        };
    }

    // Handle draw decline
    if (action.type === "DRAW_DECLINE") {
        if (pendingDrawOffer && pendingDrawOffer !== engine.turn) {
            events.push({ type: "draw_decline", fen: engine.fen });
            pendingDrawOffer = null;
        }

        return {
            state: { engine, pendingDrawOffer, repetitionHashes: Array.from(rep["positions"].entries()) },
            events,
            gameOver: false,
        };
    }

    // Handle move
    if (action.type === "MOVE") {
        const move: ChessMove = {
            from: action.from,
            to: action.to,
            promotion: action.promotion,
        };

        // Validate the move is legal
        const legalMoves = generateLegalMoves(engine);
        const isLegal = legalMoves.some(
            (m) => m.from === move.from && m.to === move.to && m.promotion === move.promotion,
        );

        if (!isLegal) {
            // Return error — move not legal
            return {
                state: { engine, pendingDrawOffer, repetitionHashes: Array.from(rep["positions"].entries()) },
                events: [],
                gameOver: false,
            };
        }

        const prevTurn = engine.turn;
        const san = moveToSAN(engine, move);

        engine = makeMove(engine, move);

        // Stamp SAN + check/checkmate onto the history entry
        const historyEntry = engine.moveHistory[engine.moveHistory.length - 1];
        const givesCheck = isInCheck(engine);
        if (historyEntry) {
            historyEntry.san = san;
            historyEntry.check = givesCheck;
        }

        const moveEvent: ChessEvent = {
            type: "move",
            move: {
                from: action.from,
                to: action.to,
                promotion: action.promotion,
                san,
                capture: historyEntry?.capture ?? false,
                check: givesCheck,
                checkmate: false,
            },
            fen: engine.fen,
            turn: engine.turn,
        };
        events.push(moveEvent);

        // Track position for repetition detection
        const board = fenToBoard(engine.fen);
        const hash = computeHash(board, engine.turn, engine.castling, engine.enPassant);
        rep.add(hash);

        // Check for game over conditions
        if (givesCheck) {
            events.push({ type: "check", fen: engine.fen });
            const { gameOver, result, resultReason } = checkGameOver(engine);
            if (gameOver) {
                engine.gameOver = true;
                engine.result = result;
                engine.resultReason = resultReason;
                moveEvent.move.checkmate = resultReason === "checkmate";
                if (historyEntry) historyEntry.checkmate = moveEvent.move.checkmate;
                events.push({ type: "checkmate", winner: prevTurn, fen: engine.fen });
            }
        } else {
            const { gameOver, result, resultReason } = checkGameOver(engine);
            if (gameOver) {
                engine.gameOver = true;
                engine.result = result;
                engine.resultReason = resultReason;
                if (resultReason === "stalemate") {
                    events.push({ type: "stalemate", fen: engine.fen });
                } else {
                    events.push({ type: "draw", reason: resultReason ?? "draw", fen: engine.fen });
                }
            }
        }

        // Check fivefold repetition (automatic draw)
        if (rep.getCount(hash) >= 5) {
            engine.gameOver = true;
            engine.result = "draw";
            engine.resultReason = "fivefold_repetition";
            events.push({ type: "draw", reason: "fivefold_repetition", fen: engine.fen });
        }

        // Clear pending draw offer after a move
        pendingDrawOffer = null;

        return {
            state: { engine, pendingDrawOffer, repetitionHashes: Array.from(rep["positions"].entries()) },
            events,
            gameOver: engine.gameOver,
            result: engine.gameOver
                ? { winner: engine.result || "draw", reason: engine.resultReason || "draw" }
                : undefined,
        };
    }

    return {
        state: { engine, pendingDrawOffer, repetitionHashes: Array.from(rep["positions"].entries()) },
        events,
        gameOver: false,
    };
}
