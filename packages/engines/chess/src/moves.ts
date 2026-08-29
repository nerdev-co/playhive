import type { EngineState, ChessMove } from "./types";
import {
    fenToBoard,
    cloneBoard,
    isWhite,
    isBlack,
    getPieceType,
    boardToFEN,
} from "./store";

/**
 * Direction vectors for sliding pieces (bishop, rook, queen).
 * Each direction is a [fileDelta, rankDelta] tuple.
 */
const DIRECTIONS: Record<string, [number, number]> = {
    n: [0, 1],
    s: [0, -1],
    e: [1, 0],
    w: [-1, 0],
    ne: [1, 1],
    nw: [-1, 1],
    se: [1, -1],
    sw: [-1, -1],
};

/**
 * Knight move offsets as [fileDelta, rankDelta].
 * All 8 possible L-shaped knight moves.
 */
const KNIGHT_MOVES: [number, number][] = [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
];

/**
 * Checks if a file/rank coordinate is within the 8x8 board.
 *
 * @param file - 0-7 (a-h)
 * @param rank - 0-7 (1-8)
 * @returns true if within bounds
 */
function inBounds(file: number, rank: number): boolean {
    return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

/**
 * Converts algebraic square (e.g., "e4") to [file, rank] coordinates.
 *
 * @param square - Algebraic notation (e.g., "e4")
 * @returns [file, rank] where file 0=a, rank 0=1
 * @throws {Error} If square string is malformed
 */
function squareToCoords(square: string): [number, number] {
    const fileChar = square[0];
    const rankChar = square[1];
    if (!fileChar || !rankChar) {
        throw new Error(`Invalid square: "${square}"`);
    }
    return [fileChar.charCodeAt(0) - 97, parseInt(rankChar, 10) - 1];
}

/**
 * Converts [file, rank] coordinates to algebraic square.
 *
 * @param file - 0-7 (a-h)
 * @param rank - 0-7 (1-8)
 * @returns Algebraic square (e.g., "e4")
 */
function coordsToSquare(file: number, rank: number): string {
    return String.fromCharCode(97 + file) + (rank + 1);
}

/**
 * Safely retrieves a piece from the board at given coordinates.
 * Returns null if coordinates are out of bounds.
 *
 * @param board - 8x8 board grid
 * @param file - 0-7
 * @param rank - 0-7
 * @returns Piece character or null if empty/out of bounds
 */
function getBoardPiece(
    board: (string | null)[][],
    file: number,
    rank: number,
): string | null {
    const row = board[rank];
    if (!row) return null;
    return row[file] ?? null;
}

/**
 * Safely sets a piece on the board at given coordinates.
 * No-op if coordinates are out of bounds.
 *
 * @param board - 8x8 board grid (will be modified)
 * @param file - 0-7
 * @param rank - 0-7
 * @param piece - Piece character or null for empty
 */
function setBoardPiece(
    board: (string | null)[][],
    file: number,
    rank: number,
    piece: string | null,
): void {
    const row = board[rank];
    if (!row) return;
    row[file] = piece;
}

/**
 * Generates sliding moves for bishop, rook, or queen.
 * Continues in each direction until blocked or capture.
 *
 * @param board - Current board state
 * @param file - Starting file (0-7)
 * @param rank - Starting rank (0-7)
 * @param dirs - Array of [fileDelta, rankDelta] direction vectors
 * @param color - Piece color ("white" | "black")
 * @returns Array of legal sliding moves
 */
function slidingMoves(
    board: (string | null)[][],
    file: number,
    rank: number,
    dirs: [number, number][],
    color: "white" | "black",
): ChessMove[] {
    const moves: ChessMove[] = [];
    const isWhitePiece = color === "white";

    for (const [df, dr] of dirs) {
        let f = file + df;
        let r = rank + dr;
        while (inBounds(f, r)) {
            const target = getBoardPiece(board, f, r);
            const from = coordsToSquare(file, rank);
            const to = coordsToSquare(f, r);

            if (target === null) {
                moves.push({ from, to });
            } else {
                const targetWhite = target === target.toUpperCase();
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

/**
 * Generates all legal pawn moves including promotions, en passant, and double-step.
 *
 * @param board - Current board state
 * @param file - Pawn file (0-7)
 * @param rank - Pawn rank (0-7)
 * @param color - Pawn color ("white" | "black")
 * @param enPassant - Current en passant target square or null
 * @returns Array of legal pawn moves including promotions
 */
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
    if (inBounds(file, oneRank)) {
        const target = getBoardPiece(board, file, oneRank);
        if (target === null) {
            const to = coordsToSquare(file, oneRank);
            if (oneRank === promotionRank) {
                for (const promo of ["q", "r", "b", "n"] as const) {
                    moves.push({ from, to, promotion: promo });
                }
            } else {
                moves.push({ from, to });
            }

            // Forward two from start
            if (rank === startRank) {
                const twoRank = rank + 2 * dir;
                if (
                    inBounds(file, rank + 2 * dir) &&
                    getBoardPiece(board, file, rank + 2 * dir) === null &&
                    getBoardPiece(board, file, oneRank) === null
                ) {
                    moves.push({
                        from: coordsToSquare(file, rank),
                        to: coordsToSquare(file, twoRank),
                    });
                }
            }
        }
    }

    // Captures (diagonal)
    for (const df of [-1, 1]) {
        const capFile = file + df;
        const capRank = rank + dir;
        if (inBounds(capFile, capRank)) {
            const target = getBoardPiece(board, capFile, capRank);
            if (target !== null) {
                const targetWhite = target === target.toUpperCase();
                if (targetWhite !== isWhitePiece) {
                    const to = coordsToSquare(capFile, capRank);
                    if (capRank === promotionRank) {
                        for (const promo of ["q", "r", "b", "n"] as const) {
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

/**
 * Generates all legal knight moves.
 *
 * @param board - Current board state
 * @param file - Knight file (0-7)
 * @param rank - Knight rank (0-7)
 * @param color - Knight color ("white" | "black")
 * @returns Array of legal knight moves
 */
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
            const target = getBoardPiece(board, f, r);
            if (
                target === null ||
                (target === target.toUpperCase()) !== isWhitePiece
            ) {
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

/**
 * Generates all legal king moves including castling.
 *
 * @param board - Current board state
 * @param file - King file (0-7)
 * @param rank - King rank (0-7)
 * @param color - King color ("white" | "black")
 * @param castling - Current castling rights for both sides
 * @returns Array of legal king moves including castling
 */
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

    // Normal king moves (one square in any direction)
    for (const [df, dr] of Object.values(DIRECTIONS) as [number, number][]) {
        const f = file + df;
        const r = rank + dr;
        if (inBounds(f, r)) {
            const target = getBoardPiece(board, f, r);
            if (
                target === null ||
                (target === target.toUpperCase()) !== isWhitePiece
            ) {
                moves.push({
                    from,
                    to: coordsToSquare(f, r),
                    capture: target !== null,
                });
            }
        }
    }

    // Castling
    const kingRank = color === "white" ? 0 : 7;
    if (rank === kingRank && file === 4) {
        // Kingside (O-O)
        if (
            (color === "white" && castling.white.kingside) ||
            (color === "black" && castling.black.kingside)
        ) {
            if (
                getBoardPiece(board, 5, kingRank) === null &&
                getBoardPiece(board, 6, kingRank) === null
            ) {
                moves.push({
                    from,
                    to: coordsToSquare(6, kingRank),
                    capture: false,
                });
            }
        }
        // Queenside (O-O-O)
        if (
            (color === "white" && castling.white.queenside) ||
            (color === "black" && castling.black.queenside)
        ) {
            if (
                getBoardPiece(board, 3, kingRank) === null &&
                getBoardPiece(board, 2, kingRank) === null &&
                getBoardPiece(board, 1, kingRank) === null
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

/**
 * Generates all legal moves for the side to move.
 * Iterates through all pieces of the current player and generates moves.
 *
 * @param state - Current engine state
 * @returns Array of { piece: square, moves: ChessMove[] } for each piece with legal moves
 */
export function generateMoves(
    state: EngineState,
): { piece: string; moves: ChessMove[] }[] {
    const board = fenToBoard(state.fen);
    const allMoves: { piece: string; moves: ChessMove[] }[] = [];

    for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
            const piece = getBoardPiece(board, file, rank);
            if (piece === null) continue;

            const isWhitePiece = piece === piece.toUpperCase();
            if (
                (state.turn === "white" && !isWhitePiece) ||
                (state.turn === "black" && isWhitePiece)
            )
                continue;

            let moves: ChessMove[] = [];
            const pieceType = piece.toLowerCase();
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
                            [1, 1],
                            [-1, 1],
                            [1, -1],
                            [-1, -1],
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
                            [0, 1],
                            [0, -1],
                            [1, 0],
                            [-1, 0],
                        ],
                        state.turn,
                    );
                    break;
                case "q":
                    moves = slidingMoves(
                        board,
                        file,
                        rank,
                        [
                            [0, 1],
                            [0, -1],
                            [1, 0],
                            [-1, 0],
                            [1, 1],
                            [-1, 1],
                            [1, -1],
                            [-1, -1],
                        ],
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
                allMoves.push({ piece: coordsToSquare(file, rank), moves });
            }
        }
    }

    return allMoves;
}

/**
 * Applies a move to the engine state and returns the new state.
 * Handles captures, promotions, castling, en passant, and updates all clocks.
 *
 * @param state - Current engine state
 * @param move - Move to apply (must be legal)
 * @returns New engine state after move
 * @throws {Error} If no piece at source square
 */
export function makeMove(state: EngineState, move: ChessMove): EngineState {
    const board = fenToBoard(state.fen);
    const newBoard = board.map((row) => [...row]);
    const [fromFile, fromRank] = squareToCoords(move.from);
    const [toFile, toRank] = squareToCoords(move.to);

    const piece = getBoardPiece(board, fromFile, fromRank);
    if (!piece) throw new Error("No piece at source square");

    // Capture the piece on the destination square BEFORE it's overwritten,
    // so we know for certain whether this move was a capture.
    const capturedPiece = getBoardPiece(board, toFile, toRank);
    let isEnPassantCapture = false;

    // Handle en passant capture
    if (piece.toLowerCase() === "p" && move.to === state.enPassant) {
        const capRank = state.turn === "white" ? toRank - 1 : toRank + 1;
        setBoardPiece(newBoard, toFile, capRank, null);
        isEnPassantCapture = true;
    }

    const isCapture = capturedPiece !== null || isEnPassantCapture;

    // Move piece
    setBoardPiece(newBoard, fromFile, fromRank, null);

    // Handle promotion
    if (move.promotion) {
        const promoPiece =
            state.turn === "white"
                ? move.promotion.toUpperCase()
                : move.promotion;
        setBoardPiece(newBoard, toFile, toRank, promoPiece);
    } else {
        setBoardPiece(newBoard, toFile, toRank, piece);
    }

    // Handle castling
    if (
        piece.toLowerCase() === "k" &&
        Math.abs(move.to.charCodeAt(0) - move.from.charCodeAt(0)) === 2
    ) {
        const kingRank = state.turn === "white" ? 0 : 7;
        if (move.to.charCodeAt(0) === 103) {
            // g-file (kingside)
            const rookFile = 7;
            const rookPiece = getBoardPiece(newBoard, rookFile, kingRank);
            if (rookPiece) {
                setBoardPiece(newBoard, rookFile, kingRank, null);
                setBoardPiece(newBoard, 5, kingRank, rookPiece);
            }
        } else if (move.to.charCodeAt(0) === 99) {
            // c-file (queenside)
            const rookFile = 0;
            const rookPiece = getBoardPiece(newBoard, rookFile, kingRank);
            if (rookPiece) {
                setBoardPiece(newBoard, rookFile, kingRank, null);
                setBoardPiece(newBoard, 3, kingRank, rookPiece);
            }
        }
    }

    // Update castling rights
    const newCastling = JSON.parse(JSON.stringify(state.castling));
    const pieceLower = piece.toLowerCase();
    if (pieceLower === "k") {
        if (state.turn === "white") {
            newCastling.white = { kingside: false, queenside: false };
        } else {
            newCastling.black = { kingside: false, queenside: false };
        }
    }
    if (pieceLower === "r") {
        if (state.turn === "white") {
            if (move.from === "a1") newCastling.white.queenside = false;
            if (move.from === "h1") newCastling.white.kingside = false;
        } else {
            if (move.from === "a8") newCastling.black.queenside = false;
            if (move.from === "h8") newCastling.black.kingside = false;
        }
    }

    // Update en passant
    let newEnPassant: string | null = null;
    if (
        piece.toLowerCase() === "p" &&
        Math.abs(squareToCoords(move.to)[1] - squareToCoords(move.from)[1]) ===
            2
    ) {
        const epRank = state.turn === "white" ? toRank - 1 : toRank + 1;
        newEnPassant = coordsToSquare(toFile, epRank);
    }

    // Update clocks — resets on a pawn move OR a capture (standard 50-move rule)
    const isPawnMove = pieceLower === "p";

    const newHalfmoveClock =
        isPawnMove || isCapture ? 0 : state.halfmoveClock + 1;
    const newFullmoveNumber =
        state.turn === "black"
            ? state.fullmoveNumber + 1
            : state.fullmoveNumber;
    const newTurn = state.turn === "white" ? "black" : "white";

    const newState: EngineState = {
        fen: boardToFEN(newBoard, {
            turn: newTurn,
            castling: newCastling,
            enPassant: newEnPassant,
            halfmoveClock:
                isPawnMove || isCapture ? 0 : state.halfmoveClock + 1,
            fullmoveNumber: newFullmoveNumber,
        }),
        turn: newTurn,
        castling: newCastling,
        enPassant: newEnPassant,
        halfmoveClock: isPawnMove || isCapture ? 0 : state.halfmoveClock + 1,
        fullmoveNumber: newFullmoveNumber,
        gameOver: false,
        moveHistory: [
            ...state.moveHistory,
            {
                from: move.from,
                to: move.to,
                promotion: move.promotion,
                capture: isCapture,
            },
        ],
    };

    return newState;
}

