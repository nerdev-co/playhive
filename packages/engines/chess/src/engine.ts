import type { EngineState, ChessMove, ChessEvent, EngineAction, EngineResult, ChessOptions } from "./types";
import { START_FEN, parseFEN, boardToFEN } from "./store";
import { generateMoves, makeMove } from "./moves";

/** Current game state singleton (one game per engine instance) */
let currentState: EngineState;

/**
 * Initializes a new chess game.
 * 
 * @param options - Optional configuration
 * @param options.fen - Optional FEN string to start from a specific position
 * @returns Initial engine state
 * 
 * @example
 * ```ts
 * const state = initGame(); // Standard starting position
 * const state = initGame({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" });
 * ```
 */
export function initGame(options: ChessOptions = {}): EngineState {
    currentState = parseFEN(options.fen || START_FEN);
    return currentState;
}

/**
 * Returns the current engine state.
 * 
 * @returns Current EngineState
 */
export function getEngineState(): EngineState {
    return currentState;
}

/**
 * Returns all legal moves for the current position grouped by piece.
 * 
 * @returns Array of { piece: square, moves: ChessMove[] }
 */
export function getMoves(): { piece: string; moves: ChessMove[] }[] {
    return generateMoves(currentState);
}

/**
 * Returns all legal actions in the EngineAction format for the current position.
 * Used by the ws-gateway engine interface.
 * 
 * @returns Array of EngineAction (type MOVE with from/to/promotion)
 */
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

/**
 * Applies an action to the current position and returns the result.
 * Core function implementing the Engine interface.
 * 
 * @param action - Action to apply (type MOVE with from/to/promotion)
 * @returns EngineResult with events, new state, gameOver flag, and result
 * 
 * @example
 * ```ts
 * const result = applyAction({ type: "MOVE", from: "e2", to: "e4" });
 * console.log(result.events); // [{ type: "move", ... }]
 * console.log(result.state.turn); // "black"
 * ```
 */
export function applyAction(action: EngineAction): EngineResult {
    const events: ChessEvent[] = [];

    const move: ChessMove = {
        from: action.from,
        to: action.to,
        promotion: action.promotion,
    };

    const prevTurn = currentState.turn;
    const prevFen = currentState.fen;

    currentState = makeMove(currentState, move);

    // Generate move event
    const moveEvent: ChessEvent = {
        type: "move",
        move: {
            from: action.from,
            to: action.to,
            promotion: action.promotion,
            san: moveToSan(currentState, move),
            capture: prevFen !== currentState.fen && currentState.moveHistory[currentState.moveHistory.length - 1]?.capture,
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
        currentState.resultReason = "fifty_move_rule";
        events.push({ type: "draw", reason: "fifty_move_rule", fen: currentState.fen });
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

/**
 * Chooses a random legal move for bot play.
 * 
 * @returns Random legal EngineAction
 * @throws {Error} If no legal moves available
 */
export function chooseBotAction(): EngineAction {
    const actions = legalActions();
    if (actions.length === 0) throw new Error("No legal moves");
    const action = actions[Math.floor(Math.random() * actions.length)];
    if (!action) throw new Error("No legal moves");
    return action;
}

/**
 * Generates simple algebraic notation for a move.
 * 
 * @param _state - Current engine state (unused, for future SAN generation)
 * @param move - Move to convert
 * @returns Basic SAN string (e.g., "e4", "exd5", "e8q")
 */
function moveToSan(_state: EngineState, move: ChessMove): string {
    return `${move.from}${move.to}${move.promotion || ""}`;
}

/**
 * Checks if the side to move is in check.
 * Currently simplified - full check detection would require generating opponent moves.
 * 
 * @param _state - Engine state to check
 * @returns true if in check (currently always false)
 */
function isInCheck(_state: EngineState): boolean {
    // Simplified - would need full check detection
    // For now, delegate to move generation logic
    return false;
}

/**
 * Checks if the position is checkmate.
 * 
 * @param state - Engine state to check
 * @returns true if checkmate
 */
function isCheckmate(state: EngineState): boolean {
    return legalActions().length === 0 && isInCheck(state);
}

/**
 * Checks if the position is stalemate.
 * 
 * @param state - Engine state to check
 * @returns true if stalemate
 */
function isStalemate(state: EngineState): boolean {
    return legalActions().length === 0 && !isInCheck(state);
}

/**
 * Checks if the position is a draw by 50-move rule.
 * 
 * @param state - Engine state to check
 * @returns true if draw by 50-move rule
 */
function isDraw(state: EngineState): boolean {
    return state.halfmoveClock >= 100; // 50-move rule = 100 halfmoves
}