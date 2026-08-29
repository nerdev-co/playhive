/**
 * Standard Algebraic Notation (SAN) for chess moves.
 *
 * Converts internal move representation to the human-readable notation
 * used in PGN and official game records:
 * - Pawn moves: "e4", "d5", "exd5", "e8=Q"
 * - Piece moves: "Nf3", "Bb5", "Qh5"
 * - Disambiguation: "Nge2", "R1a3", "Qh4e1"
 * - Castling: "O-O", "O-O-O"
 * - Check: "+" suffix
 * - Checkmate: "#" suffix
 */

import type { EngineState, ChessMove } from "./types";
import type { Position, UndoInfo } from "./moves";
import { fenToBoard, isWhite } from "./store";
import { generateLegalMoves, positionInCheck, makeMoveInPlace, unmakeMove } from "./moves";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function squareToFile(square: string): number {
    return square.charCodeAt(0) - 97;
}

function squareToRank(square: string): number {
    return parseInt(square[1] ?? "0", 10) - 1;
}

function getBoardPiece(
    board: (string | null)[][],
    file: number,
    rank: number,
): string | null {
    const row = board[rank];
    if (!row) return null;
    return row[file] ?? null;
}

/* ------------------------------------------------------------------ */
/*  SAN generation                                                     */
/* ------------------------------------------------------------------ */

const PIECE_LETTER: Record<string, string> = {
    n: "N",
    b: "B",
    r: "R",
    q: "Q",
    k: "K",
};

/**
 * Generates SAN for a move given the position BEFORE the move is made.
 *
 * @param state - Engine state before the move
 * @param move - The move to annotate
 * @returns SAN string (e.g., "Nf3", "exd5", "O-O", "e8=Q#")
 */
export function moveToSAN(state: EngineState, move: ChessMove): string {
    const board = fenToBoard(state.fen);
    const [fromFile, fromRank] = [squareToFile(move.from), squareToRank(move.from)];
    const [toFile, toRank] = [squareToFile(move.to), squareToRank(move.to)];

    const piece = getBoardPiece(board, fromFile, fromRank);
    if (!piece) return move.from + move.to;

    const pieceType = piece.toLowerCase();
    const isCapture = getBoardPiece(board, toFile, toRank) !== null ||
        (pieceType === "p" && move.to === state.enPassant);

    // Castling
    if (pieceType === "k" && Math.abs(toFile - fromFile) === 2) {
        return toFile === 6 ? "O-O" : "O-O-O";
    }

    let san = "";

    // Piece letter (empty for pawns)
    if (pieceType !== "p") {
        san += PIECE_LETTER[pieceType] ?? "";
    }

    // Disambiguation
    if (pieceType !== "p" && pieceType !== "k") {
        const disambig = getDisambiguation(board, state, move, pieceType, piece);
        san += disambig;
    }

    // Capture indicator
    if (isCapture) {
        if (pieceType === "p") {
            // Pawn captures include the file
            san += String.fromCharCode(97 + fromFile);
        }
        san += "x";
    }

    // Destination square
    san += move.to;

    // Promotion
    if (move.promotion) {
        san += `=${PIECE_LETTER[move.promotion] ?? move.promotion.toUpperCase()}`;
    }

    // Check / checkmate: make the move, check if king is in check
    const pos: Position = {
        board: fenToBoard(state.fen),
        turn: state.turn,
        castling: JSON.parse(JSON.stringify(state.castling)),
        enPassant: state.enPassant,
        halfmoveClock: state.halfmoveClock,
        fullmoveNumber: state.fullmoveNumber,
        zobristHash: 0, // not needed for check detection
    };
    const undo: UndoInfo = makeMoveInPlace(pos, move);
    const inCheck = positionInCheck(pos);
    const hasLegalMoves = generateLegalMoves(pos).length > 0;
    unmakeMove(pos, undo);

    if (inCheck) {
        san += hasLegalMoves ? "+" : "#";
    }

    return san;
}

/**
 * Determines disambiguation needed when multiple pieces of the same type
 * can move to the same square. Returns:
 * - "" if no disambiguation needed
 * - file letter (e.g., "g" for "Nge2")
 * - rank number (e.g., "1" for "R1a3")
 * - both (e.g., "a1" — extremely rare)
 */
function getDisambiguation(
    board: (string | null)[][],
    state: EngineState,
    move: ChessMove,
    pieceType: string,
    piece: string,
): string {
    const [toFile, toRank] = [squareToFile(move.to), squareToRank(move.to)];
    const [fromFile, fromRank] = [squareToFile(move.from), squareToRank(move.from)];

    const ambiguors: { file: number; rank: number }[] = [];

    for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
            if (file === fromFile && rank === fromRank) continue;

            const p = getBoardPiece(board, file, rank);
            if (!p || p.toLowerCase() !== pieceType) continue;
            if (isWhite(p) !== isWhite(piece)) continue;

            if (canPieceReach(board, file, rank, toFile, toRank, pieceType, state.turn)) {
                ambiguors.push({ file, rank });
            }
        }
    }

    if (ambiguors.length === 0) return "";

    const sameFile = ambiguors.some((a) => a.file === fromFile);
    const sameRank = ambiguors.some((a) => a.rank === fromRank);

    if (!sameFile) {
        return String.fromCharCode(97 + fromFile);
    }
    if (!sameRank) {
        return String(fromRank + 1);
    }
    return String.fromCharCode(97 + fromFile) + String(fromRank + 1);
}

/**
 * Checks if a piece at (fromFile, fromRank) can reach (toFile, toRank)
 * based on piece movement rules (not check validation — just raw movement).
 */
function canPieceReach(
    board: (string | null)[][],
    fromFile: number,
    fromRank: number,
    toFile: number,
    toRank: number,
    pieceType: string,
    turn: "white" | "black",
): boolean {
    const df = toFile - fromFile;
    const dr = toRank - fromRank;
    const absDf = Math.abs(df);
    const absDr = Math.abs(dr);

    switch (pieceType) {
        case "n":
            return (absDf === 2 && absDr === 1) || (absDf === 1 && absDr === 2);

        case "b":
            if (absDf !== absDr || absDf === 0) return false;
            return isClearDiagonal(board, fromFile, fromRank, toFile, toRank);

        case "r":
            if (df !== 0 && dr !== 0) return false;
            return isClearStraight(board, fromFile, fromRank, toFile, toRank);

        case "q":
            if (df === 0 || dr === 0) {
                return isClearStraight(board, fromFile, fromRank, toFile, toRank);
            }
            if (absDf === absDr) {
                return isClearDiagonal(board, fromFile, fromRank, toFile, toRank);
            }
            return false;

        case "k":
            return absDf <= 1 && absDr <= 1 && (absDf + absDr > 0);

        case "p": {
            const dir = turn === "white" ? 1 : -1;
            const startRank = turn === "white" ? 1 : 6;

            if (df === 0 && dr === dir) {
                return getBoardPiece(board, toFile, toRank) === null;
            }
            if (df === 0 && dr === 2 * dir && fromRank === startRank) {
                return (
                    getBoardPiece(board, toFile, toRank) === null &&
                    getBoardPiece(board, fromFile, fromRank + dir) === null
                );
            }
            if (absDf === 1 && dr === dir) {
                const target = getBoardPiece(board, toFile, toRank);
                if (target !== null) return true;
                return false;
            }
            return false;
        }

        default:
            return false;
    }
}

function isClearDiagonal(
    board: (string | null)[][],
    fromFile: number,
    fromRank: number,
    toFile: number,
    toRank: number,
): boolean {
    const df = Math.sign(toFile - fromFile);
    const dr = Math.sign(toRank - fromRank);
    let f = fromFile + df;
    let r = fromRank + dr;
    while (f !== toFile || r !== toRank) {
        if (getBoardPiece(board, f, r) !== null) return false;
        f += df;
        r += dr;
    }
    return true;
}

function isClearStraight(
    board: (string | null)[][],
    fromFile: number,
    fromRank: number,
    toFile: number,
    toRank: number,
): boolean {
    const df = Math.sign(toFile - fromFile);
    const dr = Math.sign(toRank - fromRank);
    let f = fromFile + df;
    let r = fromRank + dr;
    while (f !== toFile || r !== toRank) {
        if (getBoardPiece(board, f, r) !== null) return false;
        f += df;
        r += dr;
    }
    return true;
}
