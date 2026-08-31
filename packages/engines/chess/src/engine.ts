import type { EngineState, ChessMove, ChessEvent, EngineAction, EngineResult, ChessOptions, ChessSession, SerializedChessSession } from "./types";
import { START_FEN, parseFEN } from "./store";
import { generateMoves, makeMove, isInCheck, toPosition } from "./moves";
import { moveToSAN } from "./san";
import { fenToBoard } from "./store";
import { computeHash } from "./zobrist";
import { RepetitionTable } from "./repetition";
import { search } from "./search";

let currentState: EngineState;
const repetitions = new RepetitionTable();
let pendingDrawOffer: "white" | "black" | null = null;

export function initGame(options: ChessOptions = {}): EngineState {
    currentState = parseFEN(options.fen || START_FEN);
    repetitions.clear();
    pendingDrawOffer = null;
    const board = fenToBoard(currentState.fen);
    const hash = computeHash(board, currentState.turn, currentState.castling, currentState.enPassant);
    repetitions.add(hash);
    return currentState;
}

export function getEngineState(): EngineState {
    return currentState;
}

export function getMoves(): { piece: string; moves: ChessMove[] }[] {
    return generateMoves(currentState);
}

export function legalActions(): EngineAction[] {
    const allMoves = generateMoves(currentState);
    const actions: EngineAction[] = allMoves.flatMap(({ moves }) =>
        moves.map((move) => ({
            type: "MOVE" as const,
            from: move.from,
            to: move.to,
            promotion: move.promotion,
        })),
    );

    // Always allow resign
    actions.push({ type: "RESIGN" });

    // Allow draw offer if it's the player's turn and no pending offer
    if (!pendingDrawOffer) {
        actions.push({ type: "DRAW_OFFER" });
    }

    // Allow draw accept/decline if there's a pending offer from opponent
    if (pendingDrawOffer && pendingDrawOffer !== currentState.turn) {
        actions.push({ type: "DRAW_ACCEPT" });
        actions.push({ type: "DRAW_DECLINE" });
    }

    return actions;
}

export function applyAction(action: EngineAction): EngineResult {
    const events: ChessEvent[] = [];

    // Handle resign
    if (action.type === "RESIGN") {
        const winner = currentState.turn === "white" ? "black" : "white";
        currentState.gameOver = true;
        currentState.result = winner;
        currentState.resultReason = "resignation";
        events.push({ type: "resign", winner, fen: currentState.fen });
        return buildResult(events);
    }

    // Handle draw offer
    if (action.type === "DRAW_OFFER") {
        pendingDrawOffer = currentState.turn;
        events.push({ type: "draw_offer", offeredBy: currentState.turn, fen: currentState.fen });
        return buildResult(events);
    }

    // Handle draw accept
    if (action.type === "DRAW_ACCEPT") {
        if (pendingDrawOffer && pendingDrawOffer !== currentState.turn) {
            currentState.gameOver = true;
            currentState.result = "draw";
            currentState.resultReason = "agreement";
            events.push({ type: "draw_accept", fen: currentState.fen });
            events.push({ type: "draw", reason: "agreement", fen: currentState.fen });
            pendingDrawOffer = null;
        }
        return buildResult(events);
    }

    // Handle draw decline
    if (action.type === "DRAW_DECLINE") {
        if (pendingDrawOffer && pendingDrawOffer !== currentState.turn) {
            events.push({ type: "draw_decline", fen: currentState.fen });
            pendingDrawOffer = null;
        }
        return buildResult(events);
    }

    // Handle move
    if (action.type === "MOVE") {
        const move: ChessMove = {
            from: action.from,
            to: action.to,
            promotion: action.promotion,
        };
        const prevTurn = currentState.turn;
        const san = moveToSAN(currentState, move);

        currentState = makeMove(currentState, move);

        // Stamp SAN + check/checkmate onto the history entry
        const historyEntry = currentState.moveHistory[currentState.moveHistory.length - 1];
        const givesCheck = isInCheck(currentState);
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
            fen: currentState.fen,
            turn: currentState.turn,
        };
        events.push(moveEvent);

        // Track position for repetition detection
        const board = fenToBoard(currentState.fen);
        const hash = computeHash(board, currentState.turn, currentState.castling, currentState.enPassant);
        repetitions.add(hash);

        if (givesCheck) {
            events.push({ type: "check", fen: currentState.fen });
            if (isCheckmate(currentState)) {
                currentState.gameOver = true;
                currentState.result = prevTurn;
                currentState.resultReason = "checkmate";
                moveEvent.move.checkmate = true;
                if (historyEntry) historyEntry.checkmate = true;
                events.push({ type: "checkmate", winner: prevTurn, fen: currentState.fen });
            }
        } else if (isStalemate(currentState)) {
            currentState.gameOver = true;
            currentState.result = "draw";
            currentState.resultReason = "stalemate";
            events.push({ type: "stalemate", fen: currentState.fen });
        } else if (isDraw(currentState)) {
            currentState.gameOver = true;
            currentState.result = "draw";
            const reason = currentState.halfmoveClock >= 100 ? "fifty_move_rule" : "insufficient_material";
            currentState.resultReason = reason;
            events.push({ type: "draw", reason, fen: currentState.fen });
        } else if (isFivefoldRepetition()) {
            currentState.gameOver = true;
            currentState.result = "draw";
            currentState.resultReason = "fivefold_repetition";
            events.push({ type: "draw", reason: "threefold_repetition", fen: currentState.fen });
        }
    }

    return buildResult(events);
}

function buildResult(events: ChessEvent[]): EngineResult {
    return {
        events,
        state: currentState,
        gameOver: currentState.gameOver,
        result: currentState.gameOver
            ? {
                  winner: currentState.result || "draw",
                  reason: currentState.resultReason || "draw",
              }
            : undefined,
    };
}

/**
 * Returns true if the current player can claim a draw by threefold repetition.
 * Under FIDE rules, threefold repetition is claimable, not automatic.
 */
export function canClaimThreefold(): boolean {
    const board = fenToBoard(currentState.fen);
    const hash = computeHash(board, currentState.turn, currentState.castling, currentState.enPassant);
    return repetitions.getCount(hash) >= 3;
}

/**
 * Returns true if fivefold repetition has occurred (automatic draw under FIDE).
 */
export function isFivefoldRepetition(): boolean {
    const board = fenToBoard(currentState.fen);
    const hash = computeHash(board, currentState.turn, currentState.castling, currentState.enPassant);
    return repetitions.getCount(hash) >= 5;
}

/**
 * Chooses the best move for the bot using alpha-beta search.
 * @param depth - Search depth in plies (default: 6)
 */
export function chooseBotAction(depth: number = 6): EngineAction {
    const pos = toPosition(currentState);
    const result = search(pos, depth);
    return {
        type: "MOVE",
        from: result.bestMove.from,
        to: result.bestMove.to,
        promotion: result.bestMove.promotion,
    };
}

// ─── Session-based API ───────────────────────────────────────────────
// These functions are stateless — they take a ChessSession, process it,
// and return a new session. Safe for concurrent games.

/**
 * Create a new chess session from options.
 * Replaces initGame() for multi-game usage.
 */
export function createSession(options: ChessOptions = {}): ChessSession {
    const engine = parseFEN(options.fen || START_FEN);
    const rep = new RepetitionTable();
    const board = fenToBoard(engine.fen);
    const hash = computeHash(board, engine.turn, engine.castling, engine.enPassant);
    rep.add(hash);
    return {
        state: engine,
        repetitions: rep.serialize(),
        pendingDrawOffer: null,
    };
}

/**
 * Process an action within a session. Returns new session + result.
 * Pure function — does not mutate the input session.
 * @param actingSeat - seat index of the player performing the action (for draw negotiation)
 */
export function applyActionWithSession(
    session: ChessSession,
    action: EngineAction,
    actingSeat?: number,
): { session: ChessSession; result: EngineResult } {
    const rep = RepetitionTable.deserialize(session.repetitions);
    const events: ChessEvent[] = [];
    let engine = { ...session.state };
    let pendingDrawOffer = session.pendingDrawOffer;

    // RESIGN
    if (action.type === "RESIGN") {
        const winner = engine.turn === "white" ? "black" : "white";
        engine.gameOver = true;
        engine.result = winner;
        engine.resultReason = "resignation";
        events.push({ type: "resign", winner, fen: engine.fen });

        return {
            session: {
                state: engine,
                repetitions: rep.serialize(),
                pendingDrawOffer: null,
            },
            result: {
                events,
                state: engine,
                gameOver: true,
                result: { winner, reason: "resignation" },
            },
        };
    }

    // DRAW_OFFER
    if (action.type === "DRAW_OFFER") {
        pendingDrawOffer = engine.turn;
        events.push({ type: "draw_offer", offeredBy: engine.turn, fen: engine.fen });

        return {
            session: {
                state: engine,
                repetitions: rep.serialize(),
                pendingDrawOffer,
                pendingDrawOfferSeat: actingSeat,
            },
            result: {
                events,
                state: engine,
                gameOver: false,
            },
        };
    }

    // DRAW_ACCEPT
    if (action.type === "DRAW_ACCEPT") {
        const offerValid = pendingDrawOffer !== null &&
            (actingSeat === undefined || actingSeat !== session.pendingDrawOfferSeat);
        if (offerValid) {
            engine.gameOver = true;
            engine.result = "draw";
            engine.resultReason = "agreement";
            events.push({ type: "draw_accept", fen: engine.fen });
            events.push({ type: "draw", reason: "agreement", fen: engine.fen });
            pendingDrawOffer = null;
        }

        return {
            session: {
                state: engine,
                repetitions: rep.serialize(),
                pendingDrawOffer,
            },
            result: {
                events,
                state: engine,
                gameOver: engine.gameOver,
                result: engine.gameOver
                    ? { winner: "draw", reason: "agreement" }
                    : undefined,
            },
        };
    }

    // DRAW_DECLINE
    if (action.type === "DRAW_DECLINE") {
        const offerValid = pendingDrawOffer !== null &&
            (actingSeat === undefined || actingSeat !== session.pendingDrawOfferSeat);
        if (offerValid) {
            events.push({ type: "draw_decline", fen: engine.fen });
            pendingDrawOffer = null;
        }

        return {
            session: {
                state: engine,
                repetitions: rep.serialize(),
                pendingDrawOffer,
            },
            result: {
                events,
                state: engine,
                gameOver: false,
            },
        };
    }

    // MOVE
    if (action.type === "MOVE") {
        const move: ChessMove = {
            from: action.from,
            to: action.to,
            promotion: action.promotion,
        };

        // Validate legality
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
                session: {
                    state: engine,
                    repetitions: rep.serialize(),
                    pendingDrawOffer,
                },
                result: {
                    events: [],
                    state: engine,
                    gameOver: false,
                },
            };
        }

        const prevTurn = engine.turn;
        const san = moveToSAN(engine, move);

        engine = makeMove(engine, move);

        // Stamp SAN + check onto history
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

        // Track repetition
        const board = fenToBoard(engine.fen);
        const hash = computeHash(board, engine.turn, engine.castling, engine.enPassant);
        rep.add(hash);

        // Check game-ending conditions
        if (givesCheck) {
            events.push({ type: "check", fen: engine.fen });
            if (isCheckmate(engine)) {
                engine.gameOver = true;
                engine.result = prevTurn;
                engine.resultReason = "checkmate";
                moveEvent.move.checkmate = true;
                if (historyEntry) historyEntry.checkmate = true;
                events.push({ type: "checkmate", winner: prevTurn, fen: engine.fen });
            }
        } else if (isStalemate(engine)) {
            engine.gameOver = true;
            engine.result = "draw";
            engine.resultReason = "stalemate";
            events.push({ type: "stalemate", fen: engine.fen });
        } else if (isDraw(engine)) {
            engine.gameOver = true;
            engine.result = "draw";
            const reason = engine.halfmoveClock >= 100 ? "fifty_move_rule" : "insufficient_material";
            engine.resultReason = reason;
            events.push({ type: "draw", reason, fen: engine.fen });
        } else if (rep.getCount(hash) >= 5) {
            engine.gameOver = true;
            engine.result = "draw";
            engine.resultReason = "fivefold_repetition";
            events.push({ type: "draw", reason: "fivefold_repetition", fen: engine.fen });
        }

        pendingDrawOffer = null;

        return {
            session: {
                state: engine,
                repetitions: rep.serialize(),
                pendingDrawOffer,
            },
            result: {
                events,
                state: engine,
                gameOver: engine.gameOver,
                result: engine.gameOver
                    ? {
                          winner: engine.result || "draw",
                          reason: engine.resultReason || "draw",
                      }
                    : undefined,
            },
        };
    }

    // Unknown action
    return {
        session: {
            state: engine,
            repetitions: rep.serialize(),
            pendingDrawOffer,
        },
        result: {
            events,
            state: engine,
            gameOver: false,
        },
    };
}

/**
 * Get legal actions for a session.
 */
export function legalActionsWithSession(session: ChessSession): EngineAction[] {
    const allMoves = generateMoves(session.state);
    const actions: EngineAction[] = allMoves.flatMap(({ moves }) =>
        moves.map((move) => ({
            type: "MOVE" as const,
            from: move.from,
            to: move.to,
            promotion: move.promotion,
        })),
    );

    actions.push({ type: "RESIGN" });

    if (!session.pendingDrawOffer) {
        actions.push({ type: "DRAW_OFFER" });
    }

    if (session.pendingDrawOffer && session.pendingDrawOffer !== session.state.turn) {
        actions.push({ type: "DRAW_ACCEPT" });
        actions.push({ type: "DRAW_DECLINE" });
    }

    return actions;
}

/**
 * Bot chooses best move for a session.
 */
export function chooseBotActionWithSession(session: ChessSession, depth: number = 6): EngineAction {
    const pos = toPosition(session.state);
    const result = search(pos, depth);
    return {
        type: "MOVE",
        from: result.bestMove.from,
        to: result.bestMove.to,
        promotion: result.bestMove.promotion,
    };
}

/**
 * Serialize a session for persistence.
 */
export function serializeSession(session: ChessSession): SerializedChessSession {
    return {
        state: session.state,
        repetitions: session.repetitions,
        pendingDrawOffer: session.pendingDrawOffer,
    };
}

/**
 * Deserialize a persisted session.
 */
export function deserializeSession(data: SerializedChessSession): ChessSession {
    return {
        state: data.state,
        repetitions: data.repetitions,
        pendingDrawOffer: data.pendingDrawOffer,
    };
}

function isCheckmate(state: EngineState): boolean {
    return generateMoves(state).length === 0 && isInCheck(state);
}

function isStalemate(state: EngineState): boolean {
    return generateMoves(state).length === 0 && !isInCheck(state);
}

function isDraw(state: EngineState): boolean {
    return state.halfmoveClock >= 100 || isInsufficientMaterial(state);
}

export function checkGameOver(state: EngineState): { gameOver: boolean; result?: "white" | "black" | "draw"; resultReason?: string } {
    if (isInCheck(state) && isCheckmate(state)) {
        const winner = state.turn === "white" ? "black" : "white";
        return { gameOver: true, result: winner, resultReason: "checkmate" };
    }
    if (isStalemate(state)) {
        return { gameOver: true, result: "draw", resultReason: "stalemate" };
    }
    if (isDraw(state)) {
        const reason = state.halfmoveClock >= 100 ? "fifty_move_rule" : "insufficient_material";
        return { gameOver: true, result: "draw", resultReason: reason };
    }
    return { gameOver: false };
}

/**
 * Checks if the position is a draw due to insufficient material.
 * Covers: K vs K, K+B vs K, K+N vs K, K+B vs K+B (same-colored bishops).
 */
export function isInsufficientMaterial(state: EngineState): boolean {
    const board = fenToBoard(state.fen);
    const pieces: { type: string; color: "white" | "black"; file: number; rank: number }[] = [];

    for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
            const piece = board[rank]?.[file];
            if (!piece) continue;
            if (piece.toLowerCase() === "k") continue;
            pieces.push({
                type: piece.toLowerCase(),
                color: piece === piece.toUpperCase() ? "white" : "black",
                file,
                rank,
            });
        }
    }

    if (pieces.length === 0) return true;

    if (pieces.length === 1) {
        return pieces[0]!.type === "n" || pieces[0]!.type === "b";
    }

    if (pieces.length === 2 && pieces[0]!.type === "b" && pieces[1]!.type === "b") {
        const bishop1Color = (pieces[0]!.file + pieces[0]!.rank) % 2;
        const bishop2Color = (pieces[1]!.file + pieces[1]!.rank) % 2;
        return bishop1Color === bishop2Color;
    }

    return false;
}
