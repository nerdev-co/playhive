/**
 * Position evaluation for the chess engine.
 *
 * Uses material count + piece-square tables (PST) to assign a score
 * from the perspective of the side to move. Positive = good for the
 * side to move, negative = bad.
 *
 * The evaluation is intentionally simple — it's good enough for a
 * basic bot and gives search something meaningful to work with.
 * Can be improved later with tapered evaluation, king safety, pawn structure, etc.
 */

import type { Position } from "./moves";
import { getBoardPiece } from "./moves";

/* ------------------------------------------------------------------ */
/*  Material values (centipawns)                                       */
/* ------------------------------------------------------------------ */

const PIECE_VALUE: Record<string, number> = {
    p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000,
};

/* ------------------------------------------------------------------ */
/*  Piece-square tables (from white's perspective, rank 0 = rank 1)   */
/*  These are added to material value to reward piece placement.       */
/* ------------------------------------------------------------------ */

// fmt: off
const PST_PAWN = [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
];

const PST_KNIGHT = [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
];

const PST_BISHOP = [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
];

const PST_ROOK = [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
];

const PST_QUEEN = [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
];

const PST_KING_MIDDLEGAME = [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
];

// fmt: on

const PST: Record<string, number[]> = {
    p: PST_PAWN,
    n: PST_KNIGHT,
    b: PST_BISHOP,
    r: PST_ROOK,
    q: PST_QUEEN,
    k: PST_KING_MIDDLEGAME,
};

/** Mirrors a PST for black (flips rank axis). */
function mirrorPst(pst: number[]): number[] {
    const mirrored = new Array(64);
    for (let i = 0; i < 64; i++) {
        const rank = Math.floor(i / 8);
        const file = i % 8;
        mirrored[i] = pst[(7 - rank) * 8 + file]!;
    }
    return mirrored;
}

const PST_MIRRORED: Record<string, number[]> = {};
for (const [piece, pst] of Object.entries(PST)) {
    PST_MIRRORED[piece] = mirrorPst(pst);
}

/* ------------------------------------------------------------------ */
/*  Evaluation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Evaluates the position from the perspective of the side to move.
 * Positive score = good for the side to move.
 *
 * Returns a score in centipawns. Mate scores use large values
 * (±30000 for mate-in-1, scaling with distance).
 */
export function evaluate(position: Position): number {
    let score = 0;

    for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
            const piece = getBoardPiece(position.board, file, rank);
            if (!piece) continue;

            const pieceType = piece.toLowerCase();
            const isWhite = piece === piece.toUpperCase();
            const materialValue = PIECE_VALUE[pieceType] ?? 0;

            // Get PST value
            const pst = isWhite ? PST[pieceType] : PST_MIRRORED[pieceType];
            const pstIndex = rank * 8 + file;
            const positionalValue = pst?.[pstIndex] ?? 0;

            if (isWhite) {
                score += materialValue + positionalValue;
            } else {
                score -= materialValue + positionalValue;
            }
        }
    }

    // Return from the perspective of the side to move
    return position.turn === "white" ? score : -score;
}

/**
 * Returns true if the position is a checkmate (no legal moves + in check).
 * The score is ±(30000 - ply) to prefer shorter mates.
 */
export function isMateScore(score: number): boolean {
    return Math.abs(score) > 29000;
}

/**
 * Converts a mate score to a ply count (distance to mate).
 * Positive = mate for side to move, negative = mate against.
 */
export function mateDistance(score: number): number {
    if (score > 29000) return 30000 - score;
    if (score < -29000) return -30000 - score;
    return 0;
}
