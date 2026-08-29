import type { EngineState, ChessMove } from "./types";

/**
 * Standard starting FEN for a new chess game.
 * White to move, full castling rights, no en passant, move 1.
 */
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Piece values for evaluation (centipawns).
 * Lowercase = black, Uppercase = white.
 * King valued high to prioritize safety in simple evaluations.
 */
export const PIECE_VALUES: Record<string, number> = {
    p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
    P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000,
};

/**
 * Parses a FEN string into structured engine state.
 * Validates FEN has all 6 required fields.
 * 
 * @param fen - Full FEN string (6 space-separated fields)
 * @returns Structured EngineState with defaults for gameOver/moveHistory
 * @throws {Error} If FEN doesn't have 6 space-separated fields
 * 
 * @example
 * ```ts
 * const state = parseFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
 * console.log(state.turn); // "white"
 * console.log(state.castling.white.kingside); // true
 * ```
 */
export function parseFEN(fen: string): EngineState {
    const parts = fen.split(" ");
    if (parts.length < 6) {
        throw new Error(`Invalid FEN, expected 6 fields: "${fen}"`);
    }
    const [boardStr, turnStr, castlingStr, enPassantStr, halfmoveStr, fullmoveStr] = parts as [
        string, string, string, string, string, string
    ];

    const turn = turnStr === "w" ? "white" : "black";
    const enPassant = enPassantStr === "-" ? null : enPassantStr;
    const halfmoveClock = parseInt(halfmoveStr, 10);
    const fullmoveNumber = parseInt(fullmoveStr, 10);

    const castling = {
        white: { kingside: false, queenside: false },
        black: { kingside: false, queenside: false },
    };
    if (castlingStr !== "-") {
        for (const c of castlingStr) {
            if (c === "K") castling.white.kingside = true;
            if (c === "Q") castling.white.queenside = true;
            if (c === "k") castling.black.kingside = true;
            if (c === "q") castling.black.queenside = true;
        }
    }

    return {
        fen,
        turn,
        castling,
        enPassant,
        halfmoveClock,
        fullmoveNumber,
        gameOver: false,
        moveHistory: [],
    };
}

/**
 * Converts the board field of a FEN string into an 8x8 grid.
 * Board is indexed [rank][file] with rank 7 (index 0) = 8th rank (black's back rank)
 * down to rank 0 (index 7) = 1st rank (white's back rank).
 * 
 * @param fen - Full FEN string
 * @returns 8x8 grid of piece characters or null for empty squares
 * @throws {Error} If FEN board field is missing or malformed
 * 
 * @example
 * ```ts
 * const board = fenToBoard(START_FEN);
 * board[0][0] === "r"; // a8 = black rook
 * board[7][4] === "K"; // e1 = white king
 * ```
 */
export function fenToBoard(fen: string): (string | null)[][] {
    const boardStr = fen.split(" ")[0];
    if (!boardStr) {
        throw new Error(`Invalid FEN, missing board field: "${fen}"`);
    }
    const board: (string | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
    let rank = 7;
    let file = 0;
    for (const char of boardStr) {
        if (char === "/") {
            rank--;
            file = 0;
        } else if (char >= "1" && char <= "8") {
            file += parseInt(char, 10);
        } else {
            const row = board[rank];
            if (!row) throw new Error(`Malformed FEN board, rank out of range: "${fen}"`);
            row[file] = char;
            file++;
        }
    }
    return board;
}

/**
 * Serializes a board grid and partial engine state back into a FEN string.
 * 
 * @param board - 8x8 grid [rank][file] (rank 7 = 8th rank, index 0)
 * @param state - Partial engine state (turn, castling, enPassant, clocks)
 * @returns Valid FEN string
 * @throws {Error} If board structure is malformed
 * 
 * @example
 * ```ts
 * const fen = boardToFEN(board, { turn: "white", castling: {...}, enPassant: null, halfmoveClock: 0, fullmoveNumber: 1 });
 * ```
 */
export function boardToFEN(board: (string | null)[][], state: Partial<EngineState>): string {
    let fen = "";
    for (let rank = 7; rank >= 0; rank--) {
        let empty = 0;
        const row = board[rank];
        if (!row) throw new Error(`Malformed board, missing rank ${rank}`);
        for (let file = 0; file < 8; file++) {
            const piece = row[file];
            if (piece === null || piece === undefined) {
                empty++;
            } else {
                if (empty > 0) { fen += empty; empty = 0; }
                fen += piece;
            }
        }
        if (empty > 0) fen += empty;
        if (rank > 0) fen += "/";
    }
    fen += ` ${state.turn === "white" ? "w" : "b"} `;
    const castling = [];
    if (state.castling?.white?.kingside) castling.push("K");
    if (state.castling?.white?.queenside) castling.push("Q");
    if (state.castling?.black?.kingside) castling.push("k");
    if (state.castling?.black?.queenside) castling.push("q");
    fen += castling.length > 0 ? castling.join("") : "-";
    fen += ` ${state.enPassant ?? "-"} ${state.halfmoveClock ?? 0} ${state.fullmoveNumber ?? 1}`;
    return fen;
}

/**
 * Shallow-clones an 8x8 board grid.
 * Rows are new arrays; piece characters are primitives (strings).
 * 
 * @param board - 8x8 grid to clone
 * @returns New independent 8x8 grid
 */
export function cloneBoard(board: (string | null)[][]): (string | null)[][] {
    return board.map(row => [...row]);
}

/**
 * Checks if a piece character represents a white piece.
 * 
 * @param piece - Single character piece (e.g., "K", "p")
 * @returns true if uppercase (white), false if lowercase (black)
 */
export function isWhite(piece: string): boolean {
    return piece === piece.toUpperCase();
}

/**
 * Checks if a piece character represents a black piece.
 * 
 * @param piece - Single character piece (e.g., "k", "P")
 * @returns true if lowercase (black), false if uppercase (white)
 */
export function isBlack(piece: string): boolean {
    return piece === piece.toLowerCase();
}

/**
 * Gets the piece type ignoring color.
 * 
 * @param piece - Single character piece
 * @returns Lowercase piece type ("p", "n", "b", "r", "q", "k")
 */
export function getPieceType(piece: string): string {
    return piece.toLowerCase();
}