// @ts-nocheck
import type { EngineState, ChessMove } from "./types";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const PIECE_VALUES: Record<string, number> = {
    p: 1, n: 3, b: 3, r: 5, q: 9, k: 100,
    P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100,
};

export function parseFEN(fen: string): EngineState {
    const parts = fen.split(" ");
    const boardStr = parts[0];
    const turn = parts[1] === "w" ? "white" : "black";
    const castlingStr = parts[2];
    const enPassant = parts[3] === "-" ? null : parts[3];
    const halfmoveClock = parseInt(parts[4], 10);
    const fullmoveNumber = parseInt(parts[5], 10);

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

export function fenToBoard(fen: string): (string | null)[][] {
    const boardStr = fen.split(" ")[0];
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
            board[rank][file] = char;
            file++;
        }
    }
    return board;
}

export function boardToFEN(board: (string | null)[][], state: Partial<EngineState>): string {
    let fen = "";
    for (let rank = 7; rank >= 0; rank--) {
        let empty = 0;
        for (let file = 0; file < 8; file++) {
            const piece = board[rank][file];
            if (piece === null) {
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
    fen += ` ${state.enPassant || "-"} ${state.halfmoveClock || 0} ${state.fullmoveNumber || 1}`;
    return fen;
}

export function cloneBoard(board: (string | null)[][]): (string | null)[][] {
    return board.map(row => [...row]);
}

export function isWhite(piece: string): boolean {
    return piece === piece.toUpperCase();
}

export function isBlack(piece: string): boolean {
    return piece === piece.toLowerCase();
}

export function getPieceType(piece: string): string {
    return piece.toLowerCase();
}