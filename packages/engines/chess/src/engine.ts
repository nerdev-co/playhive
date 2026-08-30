import type { EngineState, ChessMove, ChessEvent, EngineAction, EngineResult, ChessOptions } from "./types";
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

        // Include san in the move so makeMove stores it in moveHistory
        const moveWithSan = { ...move, san };
        currentState = makeMove(currentState, moveWithSan);

        const moveEvent: ChessEvent = {
            type: "move",
            move: {
                from: action.from,
                to: action.to,
                promotion: action.promotion,
                san,
                capture: currentState.moveHistory[currentState.moveHistory.length - 1]?.capture ?? false,
                check: isInCheck(currentState),
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

        if (isInCheck(currentState)) {
            events.push({ type: "check", fen: currentState.fen });
            if (isCheckmate(currentState)) {
                currentState.gameOver = true;
                currentState.result = prevTurn;
                currentState.resultReason = "checkmate";
                moveEvent.move.checkmate = true;
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

function isCheckmate(state: EngineState): boolean {
    return generateMoves(state).length === 0 && isInCheck(state);
}

function isStalemate(state: EngineState): boolean {
    return generateMoves(state).length === 0 && !isInCheck(state);
}

function isDraw(state: EngineState): boolean {
    return state.halfmoveClock >= 100 || isInsufficientMaterial(state);
}

/**
 * Checks if the position is a draw due to insufficient material.
 * Covers: K vs K, K+B vs K, K+N vs K, K+B vs K+B (same-colored bishops).
 */
function isInsufficientMaterial(state: EngineState): boolean {
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
