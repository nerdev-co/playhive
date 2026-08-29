/**
 * Portable Game Notation (PGN) for chess games.
 *
 * Generates a complete PGN string from game history, including:
 * - Standard headers (Event, Site, Date, Round, White, Black, Result)
 * - Move text with move numbers and SAN notation
 * - Result annotation
 *
 * Also provides parsing for replay purposes.
 */

import type { EngineState, ChessMove } from "./types";
import { moveToSAN } from "./san";

/* ------------------------------------------------------------------ */
/*  PGN generation                                                     */
/* ------------------------------------------------------------------ */

export interface PGNHeaders {
    event?: string;
    site?: string;
    date?: string;
    round?: string;
    white?: string;
    black?: string;
    result?: "*" | "1-0" | "0-1" | "1/2-1/2";
}

/**
 * Generates a complete PGN string from a game's move history.
 *
 * @param state - Final engine state (with moveHistory)
 * @param headers - Optional PGN headers
 * @returns Formatted PGN string
 *
 * @example
 * ```ts
 * const pgn = generatePGN(state, { white: "Player1", black: "Bot" });
 * // [Event "PlayHive"]
 * // [Site "localhost"]
 * // [Date "2026.08.30"]
 * // [White "Player1"]
 * // [Black "Bot"]
 * // [Result "*"]
 * //
 * // 1. e4 e5 2. Nf3 Nc6 *
 * ```
 */
export function generatePGN(state: EngineState, headers: PGNHeaders = {}): string {
    const lines: string[] = [];

    // Headers
    const event = headers.event ?? "PlayHive";
    const site = headers.site ?? "localhost";
    const date = headers.date ?? formatDate(new Date());
    const round = headers.round ?? "1";
    const white = headers.white ?? "White";
    const black = headers.black ?? "Black";
    const result = headers.result ?? determineResult(state);

    lines.push(`[Event "${event}"]`);
    lines.push(`[Site "${site}"]`);
    lines.push(`[Date "${date}"]`);
    lines.push(`[Round "${round}"]`);
    lines.push(`[White "${white}"]`);
    lines.push(`[Black "${black}"]`);
    lines.push(`[Result "${result}"]`);
    lines.push("");

    // Move text
    if (state.moveHistory.length === 0) {
        lines.push(result);
        return lines.join("\n");
    }

    let moveText = "";
    let moveNumber = 1;

    for (let i = 0; i < state.moveHistory.length; i++) {
        const move = state.moveHistory[i]!;
        const isWhiteMove = i % 2 === 0;

        if (isWhiteMove) {
            moveText += `${moveNumber}. `;
        }

        // Generate SAN for this move
        // We need to reconstruct the state before this move to generate proper SAN
        const san = generateSANForMove(state, i);
        moveText += `${san} `;

        if (!isWhiteMove) {
            moveNumber++;
        }
    }

    moveText += result;
    lines.push(moveText.trim());

    return lines.join("\n");
}

/**
 * Generates SAN for a specific move in the history by reconstructing
 * the position before that move.
 */
function generateSANForMove(state: EngineState, moveIndex: number): string {
    // Reconstruct state before this move
    const moves = state.moveHistory.slice(0, moveIndex);
    const { parseFEN } = require("./store");

    // Start from initial position and replay moves
    let currentState = parseFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    const { makeMove } = require("./moves");

    for (const m of moves) {
        currentState = makeMove(currentState, m);
    }

    const move = state.moveHistory[moveIndex]!;
    return moveToSAN(currentState, move);
}

/**
 * Determines the result string from engine state.
 */
function determineResult(state: EngineState): string {
    if (!state.gameOver) return "*";
    if (state.result === "white") return "1-0";
    if (state.result === "black") return "0-1";
    return "1/2-1/2";
}

/**
 * Formats a date as YYYY.MM.DD for PGN headers.
 */
function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}.${month}.${day}`;
}

/* ------------------------------------------------------------------ */
/*  PGN move text parsing (for replay)                                 */
/* ------------------------------------------------------------------ */

/**
 * Parses a PGN move text string into an array of SAN moves.
 * Strips move numbers, comments, and result.
 *
 * @param moveText - PGN move text (e.g., "1. e4 e5 2. Nf3 Nc6")
 * @returns Array of SAN strings (e.g., ["e4", "e5", "Nf3", "Nc6"])
 */
export function parsePGNMoveText(moveText: string): string[] {
    // Remove comments
    let cleaned = moveText.replace(/\{[^}]*\}/g, "");

    // Remove NAGs (Numeric Annotation Glyphs) like $1, $2, etc.
    cleaned = cleaned.replace(/\$\d+/g, "");

    // Remove move numbers (e.g., "1.", "1...", "12.")
    cleaned = cleaned.replace(/\d+\.{1,3}/g, "");

    // Remove result
    cleaned = cleaned.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/g, "");

    // Split on whitespace and filter empty strings
    const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);

    return tokens;
}
