/**
 * View/presentation helpers for the chess engine.
 *
 * These are intentionally UI-agnostic: they return plain strings and
 * coordinate data so any renderer (React, canvas, ASCII, terminal) can
 * use them without pulling in framework-specific code.
 */

/**
 * Unicode piece symbols for rendering boards.
 *
 * Uppercase = white, lowercase = black.
 */
export const PIECE_SYMBOLS: Record<string, string> = {
    K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
    k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

/**
 * Returns the square color for a given file/rank coordinates.
 */
export function squareColor(file: number, rank: number): "light" | "dark" {
    return (file + rank) % 2 === 0 ? "light" : "dark";
}
