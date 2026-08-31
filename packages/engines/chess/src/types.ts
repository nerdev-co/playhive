/**
 * Chess Engine Types
 *
 * Type definitions for the chess engine implementing the standard Engine interface
 * compatible with the ws-gateway game engine abstraction.
 *
 * State representation uses FEN (Forsyth-Edwards Notation) as the canonical format.
 * Moves use algebraic notation (e.g., "e2e4", "e7e8q" for promotion).
 *
 * @package @playhive/chess-engine
 */

/**
 * Represents a chess piece with type and color.
 * Used for board representation and piece identification.
 */
export interface ChessPiece {
    /** Type of the piece */
    type: "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
    /** Color of the piece */
    color: "white" | "black";
}

/**
 * Algebraic chess square notation (file + rank).
 * File: a-h, Rank: 1-8 (from white's perspective).
 */
export interface ChessSquare {
    /** File (a-h) */
    file: "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
    /** Rank (1-8) */
    rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

/**
 * Chess move in algebraic notation.
 *
 * @example
 * ```ts
 * { from: "e2", to: "e4" }           // Normal move
 * { from: "e7", to: "e8", promotion: "q" }  // Promotion
 * { from: "e4", to: "d5", capture: true }   // Capture
 * ```
 */
export type ChessMove = {
    /** Source square in algebraic notation (e.g., "e2") */
    from: string;
    /** Destination square in algebraic notation (e.g., "e4") */
    to: string;
    /** Promotion piece if pawn promotes */
    promotion?: "q" | "r" | "b" | "n";
    /** Standard Algebraic Notation (e.g., "e4", "exd5", "O-O") */
    san?: string;
    /** Whether this move captures a piece */
    capture?: boolean;
    /** Whether this move gives check */
    check?: boolean;
    /** Whether this move is checkmate */
    checkmate?: boolean;
};

/**
 * Chess game events emitted during play.
 * Used for real-time updates and game replay.
 */
export type ChessEvent =
    /** A move was made */
    | { type: "move"; move: ChessMove; fen: string; turn: "white" | "black" }
    /** King is in check */
    | { type: "check"; fen: string }
    /** Checkmate - game over */
    | { type: "checkmate"; winner: "white" | "black"; fen: string }
    /** Stalemate - game over */
    | { type: "stalemate"; fen: string }
    /** Draw by various rules */
    | {
          type: "draw";
          reason:
              | "stalemate"
              | "insufficient_material"
              | "threefold_repetition"
              | "fivefold_repetition"
              | "fifty_move_rule"
              | "agreement";
          fen: string;
      }
    /** Pawn promotion occurred */
    | { type: "promotion"; move: ChessMove; fen: string }
    /** Player resigned */
    | { type: "resign"; winner: "white" | "black"; fen: string }
    /** Draw offered by a player */
    | { type: "draw_offer"; offeredBy: "white" | "black"; fen: string }
    /** Draw offer accepted */
    | { type: "draw_accept"; fen: string }
    /** Draw offer declined */
    | { type: "draw_decline"; fen: string };

/**
 * Options for initializing a chess game.
 */
export interface ChessOptions {
    /** Optional FEN string to start from a specific position */
    fen?: string;
}

/**
 * Complete engine state representing a chess position.
 *
 * FEN is the canonical representation; other fields are derived for convenience.
 *
 * @example
 * ```ts
 * const state = createInitialState();
 * console.log(state.fen); // "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
 * ```
 */
export interface EngineState {
    /** Full FEN string representing the position */
    fen: string;
    /** Side to move */
    turn: "white" | "black";
    /** Castling rights for both sides */
    castling: {
        white: { kingside: boolean; queenside: boolean };
        black: { kingside: boolean; queenside: boolean };
    };
    /** En passant target square or null */
    enPassant: string | null;
    /** Halfmove clock (for 50-move rule) */
    halfmoveClock: number;
    /** Fullmove number (increments after black's move) */
    fullmoveNumber: number;
    /** Whether the game has ended */
    gameOver: boolean;
    /** Game result if gameOver */
    result?: "white" | "black" | "draw";
    /** Reason for game end */
    resultReason?: string;
    /** History of all moves played */
    moveHistory: ChessMove[];
}

/**
 * Action sent from client to engine.
 * Supports MOVE, RESIGN, and DRAW_OFFER.
 */
export type EngineAction =
    | {
          type: "MOVE";
          /** Source square in algebraic notation */
          from: string;
          /** Destination square in algebraic notation */
          to: string;
          /** Promotion piece if pawn promotes */
          promotion?: "q" | "r" | "b" | "n";
      }
    | { type: "RESIGN" }
    | { type: "DRAW_OFFER" }
    | { type: "DRAW_ACCEPT" }
    | { type: "DRAW_DECLINE" };

/**
 * Result of applying an action to the engine.
 * Contains events for broadcasting, new state, and game end info.
 */
export interface EngineResult {
    /** Events generated by this action (for broadcasting to clients) */
    events: ChessEvent[];
    /** New engine state after action */
    state: EngineState;
    /** Whether the game has ended */
    gameOver: boolean;
    /** Winner and reason if game over */
    result?: { winner: "white" | "black" | "draw"; reason: string };
}

/**
 * Converts an algebraic square (e.g., "e4") to a 0-63 board index.
 * Rank 1 (white's back rank) = index 0-7, Rank 8 = index 56-63.
 *
 * @param square - Algebraic square notation (e.g., "e4")
 * @returns 0-63 index (rank * 8 + file)
 * @throws {Error} If square string is malformed
 *
 * @example
 * squareToIndex("e4") // returns 28 (rank 3 * 8 + file 4)
 * squareToIndex("a1") // returns 0
 * squareToIndex("h8") // returns 63
 */
export function squareToIndex(square: string): number {
    const fileChar = square[0];
    const rankChar = square[1];
    if (!fileChar || !rankChar) {
        throw new Error(`Invalid square: "${square}"`);
    }
    const file = fileChar.charCodeAt(0) - 97;
    const rank = parseInt(rankChar, 10) - 1;
    return rank * 8 + file;
}

/**
 * Converts a 0-63 board index to algebraic square notation.
 *
 * @param index - Board index (0-63)
 * @returns Algebraic square (e.g., "e4")
 *
 * @example
 * indexToSquare(28) // "e4"
 * indexToSquare(0)  // "a1"
 * indexToSquare(63) // "h8"
 */
export function indexToSquare(index: number): string {
    const file = String.fromCharCode(97 + (index % 8));
    const rank = Math.floor(index / 8) + 1;
    return file + rank;
}
