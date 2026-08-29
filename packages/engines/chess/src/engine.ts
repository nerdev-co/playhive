import type { EngineState, ChessMove, ChessEvent, EngineAction, EngineResult, ChessOptions } from "./types";
import { START_FEN, parseFEN } from "./store";
import { generateMoves, makeMove, isInCheck } from "./moves";
import { fenToBoard } from "./store";

let currentState: EngineState;

export function initGame(options: ChessOptions = {}): EngineState {
    currentState = parseFEN(options.fen || START_FEN);
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
    return allMoves.flatMap(({ moves }) =>
        moves.map((move) => ({
            type: "MOVE" as const,
            from: move.from,
            to: move.to,
            promotion: move.promotion,
        })),
    );
}

export function applyAction(action: EngineAction): EngineResult {
    const events: ChessEvent[] = [];
    const move: ChessMove = {
        from: action.from,
        to: action.to,
        promotion: action.promotion,
    };
    const prevTurn = currentState.turn;
    currentState = makeMove(currentState, move);

    const moveEvent: ChessEvent = {
        type: "move",
        move: {
            from: action.from,
            to: action.to,
            promotion: action.promotion,
            san: moveToSan(currentState, move),
            capture: currentState.moveHistory[currentState.moveHistory.length - 1]?.capture ?? false,
            check: isInCheck(currentState),
            checkmate: false,
        },
        fen: currentState.fen,
        turn: currentState.turn,
    };
    events.push(moveEvent);

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
    }

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

export function chooseBotAction(): EngineAction {
    const actions = legalActions();
    if (actions.length === 0) throw new Error("No legal moves");
    const action = actions[Math.floor(Math.random() * actions.length)];
    if (!action) throw new Error("No legal moves");
    return action;
}

function moveToSan(_state: EngineState, move: ChessMove): string {
    return `${move.from}${move.to}${move.promotion || ""}`;
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
            if (piece.toLowerCase() === "k") continue; // kings don't count
            pieces.push({
                type: piece.toLowerCase(),
                color: piece === piece.toUpperCase() ? "white" : "black",
                file,
                rank,
            });
        }
    }

    // K vs K
    if (pieces.length === 0) return true;

    // K+N vs K or K+B vs K
    if (pieces.length === 1) {
        return pieces[0]!.type === "n" || pieces[0]!.type === "b";
    }

    // K+B vs K+B — draw only if both bishops are on the same color square
    if (pieces.length === 2 && pieces[0]!.type === "b" && pieces[1]!.type === "b") {
        const bishop1Color = (pieces[0]!.file + pieces[0]!.rank) % 2;
        const bishop2Color = (pieces[1]!.file + pieces[1]!.rank) % 2;
        return bishop1Color === bishop2Color;
    }

    return false;
}
