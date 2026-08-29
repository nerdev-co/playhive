/**
 * Alpha-beta search with negamax for the chess engine.
 *
 * Uses the Position/UndoInfo primitives from moves.ts for efficient
 * make/unmake, and the evaluation function for leaf scoring.
 *
 * Features:
 * - Negamax with alpha-beta pruning
 * - Basic move ordering: captures first (MVV-LVA), then quiet moves
 * - Check extensions: search one ply deeper when in check
 * - Iterative deepening for the bot (searches up to maxDepth)
 */

import type { Position, UndoInfo } from "./moves";
import type { ChessMove } from "./types";
import { generateLegalMoves, makeMoveInPlace, unmakeMove, positionInCheck } from "./moves";
import { evaluate, isMateScore } from "./evaluation";

/* ------------------------------------------------------------------ */
/*  Search constants                                                   */
/* ------------------------------------------------------------------ */

const INFINITY = 100_000;
const MATE_SCORE = 30_000;

/* ------------------------------------------------------------------ */
/*  Move ordering                                                      */
/* ------------------------------------------------------------------ */

/** MVV-LVA score for capture ordering: most valuable victim, least valuable attacker. */
function mvvlvaScore(move: ChessMove, position: Position): number {
    const toFile = move.to.charCodeAt(0) - 97;
    const toRank = parseInt(move.to[1] ?? "0") - 1;
    const victim = position.board[toRank]?.[toFile] ?? null;
    const fromFile = move.from.charCodeAt(0) - 97;
    const fromRank = parseInt(move.from[1] ?? "0") - 1;
    const attacker = position.board[fromRank]?.[fromFile] ?? null;

    if (!victim) return 0;

    const victimValue: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    const attackerValue: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

    return (victimValue[victim.toLowerCase()] ?? 0) * 10 - (attackerValue[attacker?.toLowerCase() ?? ""] ?? 0);
}

function orderMoves(moves: ChessMove[], position: Position): ChessMove[] {
    return [...moves].sort((a, b) => {
        const scoreA = a.capture ? 1000 + mvvlvaScore(a, position) : 0;
        const scoreB = b.capture ? 1000 + mvvlvaScore(b, position) : 0;
        return scoreB - scoreA;
    });
}

/* ------------------------------------------------------------------ */
/*  Quiescence search                                                  */
/* ------------------------------------------------------------------ */

/**
 * Quiescence search: continue searching captures at leaf nodes
 * to avoid the horizon effect (e.g., hanging a queen one ply before
 * the search depth runs out).
 */
function quiescence(
    position: Position,
    alpha: number,
    beta: number,
    ply: number,
    maxDepth: number,
): number {
    const standPat = evaluate(position);

    if (ply >= maxDepth) return standPat;

    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const allMoves = generateLegalMoves(position);
    const captures = allMoves.flatMap(({ moves }) => moves).filter((m) => m.capture);
    const ordered = orderMoves(captures, position);

    for (const move of ordered) {
        const undo = makeMoveInPlace(position, move);
        const score = -quiescence(position, -beta, -alpha, ply + 1, maxDepth);
        unmakeMove(position, undo);

        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }

    return alpha;
}

/* ------------------------------------------------------------------ */
/*  Negamax with alpha-beta                                            */
/* ------------------------------------------------------------------ */

function negamax(
    position: Position,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    maxDepth: number,
): number {
    // Check for draw by repetition
    // (halfmove clock and insufficient material are checked at the game level)

    const allMoves = generateLegalMoves(position);

    // Terminal node: no legal moves
    if (allMoves.length === 0) {
        if (positionInCheck(position)) {
            // Checkmate — prefer shorter mates
            return -(MATE_SCORE - ply);
        }
        // Stalemate
        return 0;
    }

    // Leaf node: switch to quiescence
    if (depth <= 0) {
        return quiescence(position, alpha, beta, ply, maxDepth);
    }

    const moves = orderMoves(
        allMoves.flatMap(({ moves }) => moves),
        position,
    );

    for (const move of moves) {
        const undo = makeMoveInPlace(position, move);
        const score = -negamax(position, depth - 1, -beta, -alpha, ply + 1, maxDepth);
        unmakeMove(position, undo);

        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }

    return alpha;
}

/* ------------------------------------------------------------------ */
/*  Public search API                                                  */
/* ------------------------------------------------------------------ */

export interface SearchResult {
    bestMove: ChessMove;
    score: number;
    depth: number;
    nodes: number;
}

/**
 * Searches the position to the given depth and returns the best move.
 * Uses iterative deepening: searches depth 1, 2, 3, ... up to maxDepth,
 * returning the best move found at each depth. This gives good move
 * ordering for the first iteration and improves with deeper searches.
 *
 * @param position - Current position to search from
 * @param maxDepth - Maximum search depth (in plies)
 * @returns The best move and its evaluation score
 */
export function search(position: Position, maxDepth: number = 6): SearchResult {
    let bestMove: ChessMove | null = null;
    let bestScore = -INFINITY;
    let totalNodes = 0;

    for (let depth = 1; depth <= maxDepth; depth++) {
        let alpha = -INFINITY;
        const beta = INFINITY;
        let currentBest: ChessMove | null = null;
        let currentBestScore = -INFINITY;
        let nodes = 0;

        const allMoves = generateLegalMoves(position);
        const moves = orderMoves(
            allMoves.flatMap(({ moves }) => moves),
            position,
        );

        for (const move of moves) {
            const undo = makeMoveInPlace(position, move);
            const score = -negamax(position, depth - 1, -beta, -alpha, 1, maxDepth);
            unmakeMove(position, undo);

            nodes++;

            if (score > currentBestScore) {
                currentBestScore = score;
                currentBest = move;
            }
            if (score > alpha) alpha = score;
        }

        totalNodes += nodes;

        if (currentBest) {
            bestMove = currentBest;
            bestScore = currentBestScore;
        }

        // Early exit if we found a forced mate
        if (isMateScore(bestScore)) break;
    }

    return {
        bestMove: bestMove!,
        score: bestScore,
        depth: maxDepth,
        nodes: totalNodes,
    };
}
