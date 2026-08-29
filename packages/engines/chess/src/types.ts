// @ts-nocheck
export interface ChessPiece {
    type: "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";
    color: "white" | "black";
}

export interface ChessSquare {
    file: "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
    rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export type ChessMove = {
    from: string;           // e.g., "e2"
    to: string;             // e.g., "e4"
    promotion?: "q" | "r" | "b" | "n";
    san?: string;           // Standard Algebraic Notation
    capture?: boolean;
    check?: boolean;
    checkmate?: boolean;
};

export type ChessEvent =
    | { type: "move"; move: ChessMove; fen: string; turn: "white" | "black" }
    | { type: "check"; fen: string }
    | { type: "checkmate"; winner: "white" | "black"; fen: string }
    | { type: "stalemate"; fen: string }
    | { type: "draw"; reason: "stalemate" | "insufficient_material" | "threefold_repetition" | "fifty_move_rule" | "agreement"; fen: string }
    | { type: "promotion"; move: ChessMove; fen: string };

export interface ChessOptions {
    fen?: string;
}

export interface EngineState {
    fen: string;
    turn: "white" | "black";
    castling: { white: { kingside: boolean; queenside: boolean }; black: { kingside: boolean; queenside: boolean } };
    enPassant: string | null;
    halfmoveClock: number;
    fullmoveNumber: number;
    gameOver: boolean;
    result?: "white" | "black" | "draw";
    resultReason?: string;
    moveHistory: ChessMove[];
}

export interface EngineAction {
    type: "MOVE";
    from: string;
    to: string;
    promotion?: "q" | "r" | "b" | "n";
}

export interface EngineResult {
    events: ChessEvent[];
    state: EngineState;
    gameOver: boolean;
    result?: { winner: "white" | "black" | "draw"; reason: string };
}

export function squareToIndex(square: string): number {
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1], 10) - 1;
    return rank * 8 + file;
}

export function indexToSquare(index: number): string {
    const file = String.fromCharCode(97 + (index % 8));
    const rank = Math.floor(index / 8) + 1;
    return file + rank;
}