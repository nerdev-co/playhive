/**
 * Zobrist hashing for chess positions.
 *
 * Each distinct board state gets a unique 64-bit hash via XOR of random keys.
 * The hash covers: piece placement, side to move, castling rights, en passant file.
 * Halfmove/fullmove counters are excluded (not relevant for position identity).
 *
 * Keys are generated once at startup using a seeded PRNG (mulberry32) so the
 * engine produces deterministic hashes across runs — important for debugging
 * and transposition table consistency.
 */

import type { EngineState } from "./types";
import { fenToBoard } from "./store";

/* ------------------------------------------------------------------ */
/*  Seeded PRNG (mulberry32)                                           */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ------------------------------------------------------------------ */
/*  Key tables                                                         */
/* ------------------------------------------------------------------ */

// Piece keys: pieceIndex[pieceChar] → Uint32Array of 64 keys (one per square)
// pieceChar: 'P','N','B','R','Q','K','p','n','b','r','q','k'
const PIECE_CHARS = "PNBRQKpnbrqk";
const pieceKeys: Uint32Array[] = [];

let sideToMoveKey = 0;
const castlingKeys = new Uint32Array(16); // indexed by 4-bit castling mask
const enPassantKeys = new Uint32Array(8); // indexed by file (0-7), 0 = no ep

let keysInitialized = false;

function initKeys(): void {
    if (keysInitialized) return;
    const rng = mulberry32(0xBEEF_1234);

    for (let i = 0; i < PIECE_CHARS.length; i++) {
        const table = new Uint32Array(64);
        for (let sq = 0; sq < 64; sq++) {
            table[sq] = (rng() * 0x1_0000_0000) >>> 0;
        }
        pieceKeys.push(table);
    }

    sideToMoveKey = (rng() * 0x1_0000_0000) >>> 0;

    for (let i = 0; i < 16; i++) {
        castlingKeys[i] = (rng() * 0x1_0000_0000) >>> 0;
    }

    for (let i = 0; i < 8; i++) {
        enPassantKeys[i] = (rng() * 0x1_0000_0000) >>> 0;
    }

    keysInitialized = true;
}

/* ------------------------------------------------------------------ */
/*  Hash helpers                                                       */
/* ------------------------------------------------------------------ */

const PIECE_CHAR_INDEX: Record<string, number> = {};
for (let i = 0; i < PIECE_CHARS.length; i++) {
    PIECE_CHAR_INDEX[PIECE_CHARS[i]!] = i;
}

/** Square index: rank * 8 + file (0-63) */
function squareIndex(file: number, rank: number): number {
    return rank * 8 + file;
}

/** Castling rights as a 4-bit mask: K=1, Q=2, k=4, q=8 */
function castlingMask(castling: EngineState["castling"]): number {
    let mask = 0;
    if (castling.white.kingside) mask |= 1;
    if (castling.white.queenside) mask |= 2;
    if (castling.black.kingside) mask |= 4;
    if (castling.black.queenside) mask |= 8;
    return mask;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Computes the Zobrist hash for a full position from scratch.
 * Used once per game (via toSearchState), then updated incrementally.
 */
export function computeHash(
    board: (string | null)[][],
    turn: "white" | "black",
    castling: EngineState["castling"],
    enPassant: string | null,
): number {
    initKeys();

    let hash = 0;

    for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
            const piece = board[rank]?.[file];
            if (!piece) continue;
            const idx = PIECE_CHAR_INDEX[piece];
            if (idx === undefined) continue;
            hash ^= pieceKeys[idx]![squareIndex(file, rank)]!;
        }
    }

    if (turn === "black") {
        hash ^= sideToMoveKey;
    }

    hash ^= castlingKeys[castlingMask(castling)]!;

    if (enPassant) {
        const epFile = enPassant.charCodeAt(0) - 97;
        if (epFile >= 0 && epFile < 8) {
            hash ^= enPassantKeys[epFile]!;
        }
    }

    return hash;
}

/**
 * Incrementally updates the hash after a piece move (no capture, no castle, no ep).
 * XOR out the piece from source, XOR in at destination.
 */
export function movePiece(
    hash: number,
    piece: string,
    fromFile: number,
    fromRank: number,
    toFile: number,
    toRank: number,
): number {
    const idx = PIECE_CHAR_INDEX[piece];
    if (idx === undefined) return hash;
    return (
        hash ^
        pieceKeys[idx]![squareIndex(fromFile, fromRank)]! ^
        pieceKeys[idx]![squareIndex(toFile, toRank)]!
    );
}

/** XORs out a piece from the board (capture or en passant removal). */
export function removePiece(hash: number, piece: string, file: number, rank: number): number {
    const idx = PIECE_CHAR_INDEX[piece];
    if (idx === undefined) return hash;
    return hash ^ pieceKeys[idx]![squareIndex(file, rank)]!;
}

/** XORs in a piece on the board (promotion or castling rook). */
export function addPiece(hash: number, piece: string, file: number, rank: number): number {
    const idx = PIECE_CHAR_INDEX[piece];
    if (idx === undefined) return hash;
    return hash ^ pieceKeys[idx]![squareIndex(file, rank)]!;
}

/** Flips the side-to-move key. */
export function flipSide(hash: number): number {
    return hash ^ sideToMoveKey;
}

/** XORs in/out the castling rights change. */
export function updateCastling(hash: number, prev: EngineState["castling"], next: EngineState["castling"]): number {
    return hash ^ castlingKeys[castlingMask(prev)]! ^ castlingKeys[castlingMask(next)]!;
}

/** XORs in/out the en passant file. */
export function updateEnPassant(hash: number, prev: string | null, next: string | null): number {
    if (prev) {
        hash ^= enPassantKeys[prev.charCodeAt(0) - 97]!;
    }
    if (next) {
        hash ^= enPassantKeys[next.charCodeAt(0) - 97]!;
    }
    return hash;
}
