// @ts-nocheck
import type { EngineState, ChessMove, ChessSquare } from "./types";
import {
    fenToBoard,
    cloneBoard,
    isWhite,
    isBlack,
    getPieceType,
} from "./store";

const DIRECTIONS = {
    n: [0, 1],
    s: [0, -1],
    e: [1, 0],
    w: [-1, 0],
    ne: [1, 1],
    nw: [-1, 1],
    se: [1, -1],
    sw: [-1, -1],
};

const KNIGHT_MOVES = [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
];

function inBounds(file: number, rank: number): boolean {
    return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function squareToCoords(square: string): [number, number] {
    return [square.charCodeAt(0) - 97, parseInt(square[1], 10) - 1];
}

function coordsToSquare(file: number, rank: number): string {
    return String.fromCharCode(97 + file) + (rank + 1);
}

function slidingMoves(
    board: (string | null)[][],
    file: number,
    rank: number,
    dirs: [number, number][],
    color: "white" | "black",
): ChessMove[] {
    const moves: ChessMove[] = [];
    const piece = board[rank][file];
    const isWhitePiece = color === "white";

    for (const [df, dr] of dirs) {
        let f = file + df;
        let r = rank + dr;
        while (inBounds(f, r)) {
            const target = board[r][f];
            const from = coordsToSquare(file, rank);
            const to = coordsToSquare(f, r);

            if (target === null) {
                moves.push({ from, to });
            } else {
                const targetWhite = isWhite(target);
                if (targetWhite !== isWhitePiece) {
                    moves.push({ from, to, capture: true });
                }
                break;
            }
            f += df;
            r += dr;
        }
    }
    return moves;
}

function pawnMoves(
    board: (string | null)[][],
    file: number,
    rank: number,
    color: "white" | "black",
    enPassant: string | null,
): ChessMove[] {
    const moves: ChessMove[] = [];
    const dir = color === "white" ? 1 : -1;
    const startRank = color === "white" ? 1 : 6;
    const promotionRank = color === "white" ? 7 : 0;
    const isWhitePiece = color === "white";

    const from = coordsToSquare(file, rank);

    // Forward one
    const oneRank = rank + dir;
    if (inBounds(file, oneRank) && board[oneRank][file] === null) {
        const to = coordsToSquare(file, oneRank);
        if (oneRank === promotionRank) {
            for (const promo of ["q", "r", "b", "n"]) {
                moves.push({ from, to, promotion: promo });
            }
        } else {
            moves.push({ from, to });
        }

        // Forward two from start
        if (rank === startRank) {
            const twoRank = rank + 2 * dir;
            if (
                inBounds(file, twoRank) &&
                board[twoRank][file] === null &&
                board[oneRank][file] === null
            ) {
                moves.push({
                    from: coordsToSquare(file, rank),
                    to: coordsToSquare(file, twoRank),
                });
            }
        }
    }

    // Captures
    for (const df of [-1, 1]) {
        const capFile = file + df;
        const capRank = rank + dir;
        if (inBounds(capFile, capRank)) {
            const target = board[capRank][capFile];
            if (target !== null) {
                const targetWhite = isWhite(target);
                if (targetWhite !== isWhitePiece) {
                    const to = coordsToSquare(capFile, capRank);
                    if (capRank === promotionRank) {
                        for (const promo of ["q", "r", "b", "n"]) {
                            moves.push({
                                from: coordsToSquare(file, rank),
                                to,
                                promotion: promo,
                                capture: true,
                            });
                        }
                    } else {
                        moves.push({
                            from: coordsToSquare(file, rank),
                            to,
                            capture: true,
                        });
                    }
                }
            }
            // En passant
            if (enPassant && coordsToSquare(capFile, capRank) === enPassant) {
                moves.push({
                    from: coordsToSquare(file, rank),
                    to: coordsToSquare(capFile, capRank),
                    capture: true,
                });
            }
        }
    }

    return moves;
}

function knightMoves(
    board: (string | null)[][],
    file: number,
    rank: number,
    color: "white" | "black",
): ChessMove[] {
    const moves: ChessMove[] = [];
    const isWhitePiece = color === "white";
    const from = coordsToSquare(file, rank);

    for (const [df, dr] of KNIGHT_MOVES) {
        const f = file + df;
        const r = rank + dr;
        if (inBounds(f, r)) {
            const target = board[r][f];
            if (target === null || isWhite(target) !== isWhitePiece) {
                moves.push({
                    from,
                    to: coordsToSquare(f, r),
                    capture: target !== null,
                });
            }
        }
    }
    return moves;
}

function kingMoves(
    board: (string | null)[][],
    file: number,
    rank: number,
    color: "white" | "black",
    castling: EngineState["castling"],
): ChessMove[] {
    const moves: ChessMove[] = [];
    const isWhitePiece = color === "white";
    const from = coordsToSquare(file, rank);

    // Normal king moves
    for (const [df, dr] of Object.values(DIRECTIONS)) {
        const f = file + df;
        const r = rank + dr;
        if (inBounds(f, r)) {
            const target = board[r][f];
            if (target === null || isWhite(target) !== isWhitePiece) {
                moves.push({
                    from,
                    to: coordsToSquare(f, r),
                    capture: target !== null,
                });
            }
        }
    }

    // Castling
    const kingRank = isWhitePiece ? 0 : 7;
    if (rank === kingRank && file === 4) {
        // Kingside
        if (
            (isWhitePiece && castling.white.kingside) ||
            (!isWhitePiece && castling.black.kingside)
        ) {
            if (board[kingRank][5] === null && board[kingRank][6] === null) {
                moves.push({
                    from,
                    to: coordsToSquare(6, kingRank),
                    capture: false,
                });
            }
        }
        // Queenside
        if (
            (isWhitePiece && castling.white.queenside) ||
            (!isWhitePiece && castling.black.queenside)
        ) {
            if (
                board[kingRank][3] === null &&
                board[kingRank][2] === null &&
                board[kingRank][1] === null
            ) {
                moves.push({
                    from,
                    to: coordsToSquare(2, kingRank),
                    capture: false,
                });
            }
        }
    }

    return moves;
}

export function generateMoves(
    state: EngineState,
): { piece: string; moves: ChessMove[] }[] {
    const board = fenToBoard(state.fen);
    const allMoves: { piece: string; moves: ChessMove[] }[] = [];

    for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
            const piece = board[rank][file];
            if (piece === null) continue;

            const isWhitePiece = isWhite(piece);
            if (
                (state.turn === "white" && !isWhitePiece) ||
                (state.turn === "black" && isWhitePiece)
            )
                continue;

            let moves: ChessMove[] = [];
            const pieceType = getPieceType(piece);
            const square = coordsToSquare(file, rank);

            switch (pieceType) {
                case "p":
                    moves = pawnMoves(
                        board,
                        file,
                        rank,
                        state.turn,
                        state.enPassant,
                    );
                    break;
                case "n":
                    moves = knightMoves(board, file, rank, state.turn);
                    break;
                case "b":
                    moves = slidingMoves(
                        board,
                        file,
                        rank,
                        [
                            DIRECTIONS.ne,
                            DIRECTIONS.nw,
                            DIRECTIONS.se,
                            DIRECTIONS.sw,
                        ],
                        state.turn,
                    );
                    break;
                case "r":
                    moves = slidingMoves(
                        board,
                        file,
                        rank,
                        [
                            DIRECTIONS.n,
                            DIRECTIONS.s,
                            DIRECTIONS.e,
                            DIRECTIONS.w,
                        ],
                        state.turn,
                    );
                    break;
                case "q":
                    moves = slidingMoves(
                        board,
                        file,
                        rank,
                        Object.values(DIRECTIONS),
                        state.turn,
                    );
                    break;
                case "k":
                    moves = kingMoves(
                        board,
                        file,
                        rank,
                        state.turn,
                        state.castling,
                    );
                    break;
            }

            if (moves.length > 0) {
                allMoves.push({ piece: square, moves });
            }
        }
    }

    return allMoves;
}

export function makeMove(state: EngineState, move: ChessMove): EngineState {
    const board = fenToBoard(state.fen);
    const newBoard = cloneBoard(board);
    const [fromFile, fromRank] = squareToCoords(move.from);
    const [toFile, toRank] = squareToCoords(move.to);

    const piece = board[fromRank][fromFile];
    if (!piece) throw new Error("No piece at source square");

    // Handle capture
    const captured = newBoard[toRank][toFile];

    // Handle en passant capture
    if (getPieceType(piece) === "p" && move.to === state.enPassant) {
        const capRank = state.turn === "white" ? toRank - 1 : toRank + 1;
        newBoard[capRank][toFile] = null;
    }

    // Move piece
    newBoard[fromRank][fromFile] = null;

    // Handle promotion
    if (move.promotion) {
        const promoPiece =
            state.turn === "white"
                ? move.promotion.toUpperCase()
                : move.promotion;
        newBoard[toRank][toFile] = promoPiece;
    } else {
        newBoard[toRank][toFile] = piece;
    }

    // Handle castling
    if (
        getPieceType(piece) === "k" &&
        Math.abs(move.to.charCodeAt(0) - move.from.charCodeAt(0)) === 2
    ) {
        const kingRank = state.turn === "white" ? 0 : 7;
        if (move.to.charCodeAt(0) === 103) {
            // g-file (kingside)
            const rookFile = 7;
            const rookPiece = newBoard[kingRank][rookFile];
            newBoard[kingRank][rookFile] = null;
            newBoard[kingRank][5] = rookPiece;
        } else if (move.to.charCodeAt(0) === 99) {
            // c-file (queenside)
            const rookFile = 0;
            const rookPiece = newBoard[kingRank][rookFile];
            newBoard[kingRank][rookFile] = null;
            newBoard[kingRank][3] = rookPiece;
        }
    }

    // Update castling rights
    const newCastling = { ...state.castling };
    if (getPieceType(piece) === "k") {
        if (state.turn === "white") {
            newCastling.white = { kingside: false, queenside: false };
        } else {
            newCastling.black = { kingside: false, queenside: false };
        }
    }
    if (getPieceType(piece) === "r") {
        if (state.turn === "white") {
            if (move.from === "a1") newCastling.white.queenside = false;
            if (move.from === "h1") newCastling.white.kingside = false;
        } else {
            if (move.from === "a8") newCastling.black.queenside = false;
            if (move.from === "h8") newCastling.black.kingside = false;
        }
    }
    if (getPieceType(piece) === "k" && move.from === "e1") {
        newCastling.white = { kingside: false, queenside: false };
    }
    if (getPieceType(piece) === "k" && move.from === "e8") {
        newCastling.black = { kingside: false, queenside: false };
    }

    // Update en passant
    let newEnPassant: string | null = null;
    if (
        getPieceType(piece) === "p" &&
        Math.abs(squareToCoords(move.to)[1] - squareToCoords(move.from)[1]) ===
            2
    ) {
        const epRank = state.turn === "white" ? toRank - 1 : toRank + 1;
        newEnPassant = coordsToSquare(toFile, epRank);
    }

    // Update clocks
    const isCapture =
        board[toRank][toFile] !== null ||
        (getPieceType(piece) === "p" && move.to === state.enPassant);
    const isPawnMove = getPieceType(piece) === "p";
    const newHalfmove = isCapture || isPawnMove ? 0 : state.halfmoveClock + 1;
    const newFullmove =
        state.turn === "black"
            ? state.fullmoveNumber + 1
            : state.fullmoveNumber;

    const newFen = boardToFEN(newBoard, {
        turn: state.turn === "white" ? "black" : "white",
        castling: newCastling,
        enPassant: newEnPassant,
        halfmoveClock: newHalfmove,
        fullmoveNumber: newFullmove,
    });

    const newState: EngineState = {
        fen: newFen,
        turn: state.turn === "white" ? "black" : "white",
        castling: newCastling,
        enPassant: newEnPassant,
        halfmoveClock: newHalfmove,
        fullmoveNumber: newFullmove,
        gameOver: false,
        moveHistory: [...state.moveHistory, move],
    };

    return newState;
}

function squareToCoords(square: string): [number, number] {
    return [square.charCodeAt(0) - 97, parseInt(square[1], 10) - 1];
}

function isWhite(piece: string): boolean {
    return piece === piece.toUpperCase();
}

function getPieceType(piece: string): string {
    return piece.toLowerCase();
}

function boardToFEN(
    board: (string | null)[][],
    state: Partial<EngineState>,
): string {
    let fen = "";
    for (let rank = 7; rank >= 0; rank--) {
        let empty = 0;
        for (let file = 0; file < 8; file++) {
            const piece = board[rank][file];
            if (piece === null) {
                empty++;
            } else {
                if (empty > 0) {
                    fen += empty;
                    empty = 0;
                }
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
