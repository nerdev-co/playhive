// @ts-nocheck
// @ts-nocheck
import type { EngineState, ChessMove, ChessEvent, EngineAction, EngineResult, ChessOptions } from "./types";
import { START_FEN } from "./store";
import { parseFEN, generateMoves, makeMove } from "./moves";

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
    return allMoves.flatMap(({ piece, moves }) =>
        moves.map(move => ({
            type: "MOVE" as const,
            from: move.from,
            to: move.to,
            promotion: move.promotion,
        }))
    );
}

export function applyAction(action: EngineAction): EngineResult {
    const events: ChessEvent[] = [];
    const move: ChessAction = {
        type: action.type,
        from: action.from,
        to: action.to,
        promotion: action.promotion,
    };

    const prevTurn = currentState.turn;
    const prevFen = currentState.fen;

    currentState = makeMove(currentState, move);

    // Generate event
    const moveEvent: ChessEvent = {
        type: "move",
        move: {
            from: action.from,
            to: action.to,
            promotion: action.promotion,
            san: moveToSan(currentState, move),
            capture: prevFen !== currentState.fen && currentState.moveHistory[currentState.moveHistory.length - 1].capture,
            check: isInCheck(currentState),
            checkmate: false,
        },
        fen: currentState.fen,
        turn: currentState.turn,
    };
    events.push(moveEvent);

    // Check for check/checkmate
    if (isInCheck(currentState)) {
        events.push({ type: "check", fen: currentState.fen });
        if (isCheckmate(currentState)) {
            const winner = prevTurn === "white" ? "white" : "black";
            currentState.gameOver = true;
            currentState.result = winner;
            currentState.resultReason = "checkmate";
            events.push({ type: "checkmate", winner, fen: currentState.fen });
        }
    } else if (isStalemate(currentState)) {
        currentState.gameOver = true;
        currentState.result = "draw";
        currentState.resultReason = "stalemate";
        events.push({ type: "stalemate", fen: currentState.fen });
    } else if (isDraw(currentState)) {
        currentState.gameOver = true;
        currentState.result = "draw";
        currentState.resultReason = "draw";
        events.push({ type: "draw", reason: "draw", fen: currentState.fen });
    }

    return {
        events,
        state: currentState,
        gameOver: currentState.gameOver,
        result: currentState.gameOver ? {
            winner: currentState.result || "draw",
            reason: currentState.resultReason || "draw",
        } : undefined,
    };
}

export function chooseBotAction(): EngineAction {
    const actions = legalActions();
    if (actions.length === 0) throw new Error("No legal moves");
    return actions[Math.floor(Math.random() * actions.length)];
}

function moveToSan(state: EngineState, move: ChessAction): string {
    return `${move.from}${move.to}${move.promotion || ""}`;
}

function isInCheck(state: EngineState): boolean {
    // Simplified - would need full check detection
    return false;
}

function isCheckmate(state: EngineState): boolean {
    return legalActions().length === 0 && isInCheck(state);
}

function isStalemate(state: EngineState): boolean {
    return legalActions().length === 0 && !isInCheck(state);
}

function isDraw(state: EngineState): boolean {
    return state.halfmoveClock >= 100; // 50-move rule
}