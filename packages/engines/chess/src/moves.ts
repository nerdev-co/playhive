import type { EngineState, ChessMove } from "./types";
import { fenToBoard, isWhite, isBlack, boardToFEN } from "./store";
import {
    computeHash,
    movePiece,
    removePiece,
    addPiece,
    flipSide,
    updateCastling,
    updateEnPassant,
} from "./zobrist";

const ORTHOGONAL_DIRS: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIAGONAL_DIRS: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const ALL_DIRS: [number, number][] = [...ORTHOGONAL_DIRS, ...DIAGONAL_DIRS];

const KNIGHT_MOVES: [number, number][] = [
    [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2],
];

function inBounds(file: number, rank: number): boolean {
    return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function squareToCoords(square: string): [number, number] {
    const fileChar = square[0];
    const rankChar = square[1];
    if (!fileChar || !rankChar) {
        throw new Error(`Invalid square: "${square}"`);
    }
    return [fileChar.charCodeAt(0) - 97, parseInt(rankChar, 10) - 1];
}

function coordsToSquare(file: number, rank: number): string {
    return String.fromCharCode(97 + file) + (rank + 1);
}

function squareKey(file: number, rank: number): string {
    return `${file},${rank}`;
}

export function getBoardPiece(
    board: (string | null)[][],
    file: number,
    rank: number,
): string | null {
    const row = board[rank];
    if (!row) return null;
    const piece = row[file];
    return piece ?? null;
}

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

function isColorPiece(piece: string, color: "white" | "black"): boolean {
    return color === "white" ? isWhite(piece) : isBlack(piece);
}

function findKing(
    board: (string | null)[][],
    color: "white" | "black",
): [number, number] | null {
    const kingChar = color === "white" ? "K" : "k";
    for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
            if (getBoardPiece(board, file, rank) === kingChar) return [file, rank];
        }
    }
    return null;
}

function isSquareAttacked(
    board: (string | null)[][],
    file: number,
    rank: number,
    byColor: "white" | "black",
): boolean {
    const pawnRankOffset = byColor === "white" ? -1 : 1;
    for (const df of [-1, 1]) {
        const pf = file + df, pr = rank + pawnRankOffset;
        if (inBounds(pf, pr)) {
            const p = getBoardPiece(board, pf, pr);
            if (p && p.toLowerCase() === "p" && isColorPiece(p, byColor)) return true;
        }
    }
    for (const [df, dr] of KNIGHT_MOVES) {
        const f = file + df, r = rank + dr;
        if (inBounds(f, r)) {
            const p = getBoardPiece(board, f, r);
            if (p && p.toLowerCase() === "n" && isColorPiece(p, byColor)) return true;
        }
    }
    for (const [df, dr] of ALL_DIRS) {
        const f = file + df, r = rank + dr;
        if (inBounds(f, r)) {
            const p = getBoardPiece(board, f, r);
            if (p && p.toLowerCase() === "k" && isColorPiece(p, byColor)) return true;
        }
    }
    for (const [df, dr] of DIAGONAL_DIRS) {
        let f = file + df, r = rank + dr;
        while (inBounds(f, r)) {
            const p = getBoardPiece(board, f, r);
            if (p) {
                const type = p.toLowerCase();
                if (isColorPiece(p, byColor) && (type === "b" || type === "q")) return true;
                break;
            }
            f += df; r += dr;
        }
    }
    for (const [df, dr] of ORTHOGONAL_DIRS) {
        let f = file + df, r = rank + dr;
        while (inBounds(f, r)) {
            const p = getBoardPiece(board, f, r);
            if (p) {
                const type = p.toLowerCase();
                if (isColorPiece(p, byColor) && (type === "r" || type === "q")) return true;
                break;
            }
            f += df; r += dr;
        }
    }
    return false;
}

export function isInCheck(
    state: EngineState,
    color: "white" | "black" = state.turn,
): boolean {
    const board = fenToBoard(state.fen);
    const kingPos = findKing(board, color);
    if (!kingPos) return false;
    const opponent = color === "white" ? "black" : "white";
    return isSquareAttacked(board, kingPos[0], kingPos[1], opponent);
}

/** Check detection for a Position (used in search — avoids FEN re-parsing). */
export function positionInCheck(position: Position): boolean {
    const kingPos = findKing(position.board, position.turn);
    if (!kingPos) return false;
    const opponent = position.turn === "white" ? "black" : "white";
    return isSquareAttacked(position.board, kingPos[0], kingPos[1], opponent);
}

interface CheckInfo {
    checkers: { pos: [number, number]; slidingDir: [number, number] | null }[];
    blockSquares: Set<string>;
    pinned: Map<string, [number, number]>;
}

function computeCheckInfo(board: (string | null)[][], color: "white" | "black"): CheckInfo {
    const info: CheckInfo = { checkers: [], blockSquares: new Set(), pinned: new Map() };
    const kingPos = findKing(board, color);
    if (!kingPos) return info;
    const [kf, kr] = kingPos;
    const opponent = color === "white" ? "black" : "white";

    for (const [df, dr] of KNIGHT_MOVES) {
        const f = kf + df, r = kr + dr;
        if (inBounds(f, r)) {
            const p = getBoardPiece(board, f, r);
            if (p && p.toLowerCase() === "n" && isColorPiece(p, opponent)) {
                info.checkers.push({ pos: [f, r], slidingDir: null });
            }
        }
    }

    const pawnRankOffset = color === "white" ? 1 : -1;
    for (const df of [-1, 1]) {
        const f = kf + df, r = kr + pawnRankOffset;
        if (inBounds(f, r)) {
            const p = getBoardPiece(board, f, r);
            if (p && p.toLowerCase() === "p" && isColorPiece(p, opponent)) {
                info.checkers.push({ pos: [f, r], slidingDir: null });
            }
        }
    }

    const rayTypes: { dir: [number, number]; sliders: string[] }[] = [
        ...ORTHOGONAL_DIRS.map((dir) => ({ dir, sliders: ["r", "q"] })),
        ...DIAGONAL_DIRS.map((dir) => ({ dir, sliders: ["b", "q"] })),
    ];

    for (const { dir, sliders } of rayTypes) {
        const [df, dr] = dir;
        let f = kf + df, r = kr + dr;
        let first: { f: number; r: number; piece: string } | null = null;
        let second: { f: number; r: number; piece: string } | null = null;

        while (inBounds(f, r)) {
            const p = getBoardPiece(board, f, r);
            if (p) {
                if (!first) first = { f, r, piece: p };
                else { second = { f, r, piece: p }; break; }
            }
            f += df; r += dr;
        }

        if (!first) continue;
        const firstIsEnemySlider =
            isColorPiece(first.piece, opponent) && sliders.includes(first.piece.toLowerCase());

        if (firstIsEnemySlider) {
            info.checkers.push({ pos: [first.f, first.r], slidingDir: dir });
        } else if (isColorPiece(first.piece, color) && second) {
            const secondIsEnemySlider =
                isColorPiece(second.piece, opponent) && sliders.includes(second.piece.toLowerCase());
            if (secondIsEnemySlider) {
                info.pinned.set(squareKey(first.f, first.r), dir);
            }
        }
    }

    if (info.checkers.length === 1) {
        const c = info.checkers[0]!;
        if (c.slidingDir) {
            let f = kf + c.slidingDir[0], r = kr + c.slidingDir[1];
            while (f !== c.pos[0] || r !== c.pos[1]) {
                info.blockSquares.add(squareKey(f, r));
                f += c.slidingDir[0]; r += c.slidingDir[1];
            }
        }
        info.blockSquares.add(squareKey(c.pos[0], c.pos[1]));
    }

    return info;
}

function enPassantExposesCheck(
    board: (string | null)[][],
    fromFile: number,
    fromRank: number,
    toFile: number,
    toRank: number,
    color: "white" | "black",
): boolean {
    const capRank = color === "white" ? toRank - 1 : toRank + 1;
    const scratch = board.map((row) => [...row]);
    const movingPawn = scratch[fromRank]![fromFile] ?? null;
    scratch[fromRank]![fromFile] = null;
    scratch[capRank]![toFile] = null;
    scratch[toRank]![toFile] = movingPawn;

    const kingPos = findKing(scratch, color);
    if (!kingPos) return false;
    const opponent = color === "white" ? "black" : "white";
    return isSquareAttacked(scratch, kingPos[0], kingPos[1], opponent);
}

function isKingMoveSafe(
    board: (string | null)[][],
    kingFile: number,
    kingRank: number,
    toFile: number,
    toRank: number,
    opponent: "white" | "black",
): boolean {
    const scratch = board.map((row) => [...row]);
    scratch[kingRank]![kingFile] = null;
    scratch[toRank]![toFile] = null;
    return !isSquareAttacked(scratch, toFile, toRank, opponent);
}

function slidingMoves(
    board: (string | null)[][],
    file: number,
    rank: number,
    dirs: [number, number][],
    color: "white" | "black",
): ChessMove[] {
    const moves: ChessMove[] = [];
    for (const [df, dr] of dirs) {
        let f = file + df, r = rank + dr;
        while (inBounds(f, r)) {
            const target = getBoardPiece(board, f, r);
            const from = coordsToSquare(file, rank);
            const to = coordsToSquare(f, r);
            if (target === null) {
                moves.push({ from, to });
            } else {
                if (isColorPiece(target, color === "white" ? "black" : "white")) {
                    moves.push({ from, to, capture: true });
                }
                break;
            }
            f += df; r += dr;
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
    const from = coordsToSquare(file, rank);

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
            if (rank === startRank) {
                const twoRank = rank + 2 * dir;
                if (
                    inBounds(file, twoRank) &&
                    getBoardPiece(board, file, twoRank) === null &&
                    getBoardPiece(board, file, oneRank) === null
                ) {
                    moves.push({ from, to: coordsToSquare(file, twoRank) });
                }
            }
        }
    }

    for (const df of [-1, 1]) {
        const capFile = file + df, capRank = rank + dir;
        if (inBounds(capFile, capRank)) {
            const target = getBoardPiece(board, capFile, capRank);
            if (target !== null && isColorPiece(target, color === "white" ? "black" : "white")) {
                const to = coordsToSquare(capFile, capRank);
                if (capRank === promotionRank) {
                    for (const promo of ["q", "r", "b", "n"] as const) {
                        moves.push({ from, to, promotion: promo, capture: true });
                    }
                } else {
                    moves.push({ from, to, capture: true });
                }
            }
            if (enPassant && coordsToSquare(capFile, capRank) === enPassant) {
                moves.push({ from, to: coordsToSquare(capFile, capRank), capture: true });
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
    const from = coordsToSquare(file, rank);
    for (const [df, dr] of KNIGHT_MOVES) {
        const f = file + df, r = rank + dr;
        if (inBounds(f, r)) {
            const target = getBoardPiece(board, f, r);
            if (target === null || isColorPiece(target, color === "white" ? "black" : "white")) {
                moves.push({ from, to: coordsToSquare(f, r), capture: target !== null });
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
    const from = coordsToSquare(file, rank);
    const opponent = color === "white" ? "black" : "white";

    for (const [df, dr] of ALL_DIRS) {
        const f = file + df, r = rank + dr;
        if (inBounds(f, r)) {
            const target = getBoardPiece(board, f, r);
            if (target === null || isColorPiece(target, opponent)) {
                moves.push({ from, to: coordsToSquare(f, r), capture: target !== null });
            }
        }
    }

    const kingRank = color === "white" ? 0 : 7;
    if (rank === kingRank && file === 4 && !isSquareAttacked(board, file, rank, opponent)) {
        const rights = color === "white" ? castling.white : castling.black;
        if (
            rights.kingside &&
            getBoardPiece(board, 5, kingRank) === null &&
            getBoardPiece(board, 6, kingRank) === null &&
            !isSquareAttacked(board, 5, kingRank, opponent) &&
            !isSquareAttacked(board, 6, kingRank, opponent)
        ) {
            moves.push({ from, to: coordsToSquare(6, kingRank), capture: false });
        }
        if (
            rights.queenside &&
            getBoardPiece(board, 3, kingRank) === null &&
            getBoardPiece(board, 2, kingRank) === null &&
            getBoardPiece(board, 1, kingRank) === null &&
            !isSquareAttacked(board, 3, kingRank, opponent) &&
            !isSquareAttacked(board, 2, kingRank, opponent)
        ) {
            moves.push({ from, to: coordsToSquare(2, kingRank), capture: false });
        }
    }

    return moves;
}

/** Shared move-generation core — works off raw board + metadata, used by
 *  both the FEN-based public API and the mutable search path below, so
 *  the two never drift out of sync with each other. */
function generateLegalMovesForBoard(
    board: (string | null)[][],
    turn: "white" | "black",
    castling: EngineState["castling"],
    enPassant: string | null,
): { piece: string; moves: ChessMove[] }[] {
    const info = computeCheckInfo(board, turn);
    const opponent = turn === "white" ? "black" : "white";
    const inDoubleCheck = info.checkers.length >= 2;
    const allMoves: { piece: string; moves: ChessMove[] }[] = [];

    for (let rank = 0; rank < 8; rank++) {
        for (let file = 0; file < 8; file++) {
            const piece = getBoardPiece(board, file, rank);
            if (piece === null || !isColorPiece(piece, turn)) continue;

            const pieceType = piece.toLowerCase();
            let pseudoMoves: ChessMove[] = [];

            switch (pieceType) {
                case "p": pseudoMoves = pawnMoves(board, file, rank, turn, enPassant); break;
                case "n": pseudoMoves = knightMoves(board, file, rank, turn); break;
                case "b": pseudoMoves = slidingMoves(board, file, rank, DIAGONAL_DIRS, turn); break;
                case "r": pseudoMoves = slidingMoves(board, file, rank, ORTHOGONAL_DIRS, turn); break;
                case "q": pseudoMoves = slidingMoves(board, file, rank, ALL_DIRS, turn); break;
                case "k": pseudoMoves = kingMoves(board, file, rank, turn, castling); break;
            }

            let legalMoves: ChessMove[];

            if (pieceType === "k") {
                legalMoves = pseudoMoves.filter((move) => {
                    const [tf, tr] = squareToCoords(move.to);
                    return isKingMoveSafe(board, file, rank, tf, tr, opponent);
                });
            } else if (inDoubleCheck) {
                legalMoves = [];
            } else {
                const pinDir = info.pinned.get(squareKey(file, rank));

                legalMoves = pseudoMoves.filter((move) => {
                    const [tf, tr] = squareToCoords(move.to);

                    if (pinDir) {
                        const mdf = tf - file, mdr = tr - rank;
                        const cross = mdf * pinDir[1] - mdr * pinDir[0];
                        if (cross !== 0) return false;
                    }

                    const isEnPassant = pieceType === "p" && move.to === enPassant;

                    if (info.checkers.length === 1) {
                        if (isEnPassant) {
                            const capRank = turn === "white" ? tr - 1 : tr + 1;
                            if (!info.blockSquares.has(squareKey(tf, capRank))) return false;
                        } else if (!info.blockSquares.has(squareKey(tf, tr))) {
                            return false;
                        }
                    }

                    if (isEnPassant && enPassantExposesCheck(board, file, rank, tf, tr, turn)) {
                        return false;
                    }

                    return true;
                });
            }

            if (legalMoves.length > 0) {
                allMoves.push({ piece: coordsToSquare(file, rank), moves: legalMoves });
            }
        }
    }

    return allMoves;
}

export function generateMoves(state: EngineState): { piece: string; moves: ChessMove[] }[] {
    const board = fenToBoard(state.fen);
    return generateLegalMovesForBoard(board, state.turn, state.castling, state.enPassant);
}

/** Search-oriented move generation: takes a SearchState directly, so a
 *  search loop calling this at every node isn't re-parsing a FEN string
 *  each time — see makeMoveInPlace/unmakeMove below. */
export function generateLegalMoves(state: Position): { piece: string; moves: ChessMove[] }[] {
    return generateLegalMovesForBoard(state.board, state.turn, state.castling, state.enPassant);
}

/**
 * Mutable board + position metadata, with no FEN string attached. This is
 * the representation a search loop should hold onto: it gets built once
 * per search (via toSearchState), then makeMoveInPlace/unmakeMove mutate
 * it and reverse the mutation in place for every node, instead of
 * allocating a fresh board array and re-stringifying a FEN at each ply.
 */
export interface Position {
    board: (string | null)[][];
    turn: "white" | "black";
    castling: EngineState["castling"];
    enPassant: string | null;
    halfmoveClock: number;
    fullmoveNumber: number;
    zobristHash: number;
}

export function toPosition(state: EngineState): Position {
    const board = fenToBoard(state.fen);
    return {
        board,
        turn: state.turn,
        castling: JSON.parse(JSON.stringify(state.castling)),
        enPassant: state.enPassant,
        halfmoveClock: state.halfmoveClock,
        fullmoveNumber: state.fullmoveNumber,
        zobristHash: computeHash(board, state.turn, state.castling, state.enPassant),
    };
}

/** Everything makeMoveInPlace needs to hand back so unmakeMove can undo it
 *  exactly, including edge cases a plain "put the old piece back" can't
 *  cover on its own: a promoted pawn, a captured piece one square off from
 *  the destination (en passant), and a rook that rode along on castling. */
export interface UndoInfo {
    move: ChessMove;
    movedPiece: string;
    capturedPiece: string | null;
    capturedSquare: [number, number];
    isEnPassant: boolean;
    castleRookMove: { from: [number, number]; to: [number, number]; piece: string } | null;
    prevCastling: EngineState["castling"];
    prevEnPassant: string | null;
    prevHalfmoveClock: number;
    prevFullmoveNumber: number;
    prevTurn: "white" | "black";
    prevZobristHash: number;
}

/** Applies `move` to `state` in place and returns everything needed to
 *  reverse it via unmakeMove. Intended for a search loop: call this,
 *  recurse, then always call unmakeMove with the returned UndoInfo before
 *  trying the next candidate move at this node. */
export function makeMoveInPlace(state: Position, move: ChessMove): UndoInfo {
    const [fromFile, fromRank] = squareToCoords(move.from);
    const [toFile, toRank] = squareToCoords(move.to);
    const board = state.board;
    const mover = state.turn;
    const prevZobristHash = state.zobristHash;

    const movedPiece = getBoardPiece(board, fromFile, fromRank);
    if (!movedPiece) throw new Error("No piece at source square");

    const isEnPassant = movedPiece.toLowerCase() === "p" && move.to === state.enPassant;
    let capturedSquare: [number, number] = [toFile, toRank];
    let capturedPiece: string | null;

    let hash = state.zobristHash;

    if (isEnPassant) {
        const capRank = mover === "white" ? toRank - 1 : toRank + 1;
        capturedSquare = [toFile, capRank];
        capturedPiece = getBoardPiece(board, toFile, capRank);
        setBoardPiece(board, toFile, capRank, null);
        // Remove captured pawn from hash
        if (capturedPiece) {
            hash = removePiece(hash, capturedPiece, toFile, capRank);
        }
    } else {
        capturedPiece = getBoardPiece(board, toFile, toRank);
        // Remove captured piece from hash (if any)
        if (capturedPiece) {
            hash = removePiece(hash, capturedPiece, toFile, toRank);
        }
    }

    // Move piece: remove from source, add at destination
    setBoardPiece(board, fromFile, fromRank, null);
    if (move.promotion) {
        const promoPiece = mover === "white" ? move.promotion.toUpperCase() : move.promotion;
        setBoardPiece(board, toFile, toRank, promoPiece);
        hash = removePiece(hash, movedPiece, fromFile, fromRank);
        hash = addPiece(hash, promoPiece, toFile, toRank);
    } else {
        setBoardPiece(board, toFile, toRank, movedPiece);
        hash = movePiece(hash, movedPiece, fromFile, fromRank, toFile, toRank);
    }

    // Castling rook
    let castleRookMove: UndoInfo["castleRookMove"] = null;
    if (
        movedPiece.toLowerCase() === "k" &&
        Math.abs(move.to.charCodeAt(0) - move.from.charCodeAt(0)) === 2
    ) {
        const kingRank = mover === "white" ? 0 : 7;
        if (move.to.charCodeAt(0) === 103) {
            const rookPiece = getBoardPiece(board, 7, kingRank);
            if (rookPiece) {
                setBoardPiece(board, 7, kingRank, null);
                setBoardPiece(board, 5, kingRank, rookPiece);
                hash = movePiece(hash, rookPiece, 7, kingRank, 5, kingRank);
                castleRookMove = { from: [7, kingRank], to: [5, kingRank], piece: rookPiece };
            }
        } else if (move.to.charCodeAt(0) === 99) {
            const rookPiece = getBoardPiece(board, 0, kingRank);
            if (rookPiece) {
                setBoardPiece(board, 0, kingRank, null);
                setBoardPiece(board, 3, kingRank, rookPiece);
                hash = movePiece(hash, rookPiece, 0, kingRank, 3, kingRank);
                castleRookMove = { from: [0, kingRank], to: [3, kingRank], piece: rookPiece };
            }
        }
    }

    const prevCastling: EngineState["castling"] = JSON.parse(JSON.stringify(state.castling));
    const pieceLower = movedPiece.toLowerCase();

    if (pieceLower === "k") {
        if (mover === "white") state.castling.white = { kingside: false, queenside: false };
        else state.castling.black = { kingside: false, queenside: false };
    }
    if (pieceLower === "r") {
        if (mover === "white") {
            if (move.from === "a1") state.castling.white.queenside = false;
            if (move.from === "h1") state.castling.white.kingside = false;
        } else {
            if (move.from === "a8") state.castling.black.queenside = false;
            if (move.from === "h8") state.castling.black.kingside = false;
        }
    }
    if (capturedPiece && capturedPiece.toLowerCase() === "r" && !isEnPassant) {
        if (move.to === "a1") state.castling.white.queenside = false;
        if (move.to === "h1") state.castling.white.kingside = false;
        if (move.to === "a8") state.castling.black.queenside = false;
        if (move.to === "h8") state.castling.black.kingside = false;
    }

    // Update castling hash
    hash = updateCastling(hash, prevCastling, state.castling);

    const prevEnPassant = state.enPassant;
    let newEnPassant: string | null = null;
    if (pieceLower === "p" && Math.abs(toRank - fromRank) === 2) {
        const epRank = mover === "white" ? toRank - 1 : toRank + 1;
        newEnPassant = coordsToSquare(toFile, epRank);
    }
    state.enPassant = newEnPassant;

    // Update en passant hash
    hash = updateEnPassant(hash, prevEnPassant, newEnPassant);

    // Flip side to move
    hash = flipSide(hash);

    const prevHalfmoveClock = state.halfmoveClock;
    const isCapture = capturedPiece !== null;
    state.halfmoveClock = pieceLower === "p" || isCapture ? 0 : state.halfmoveClock + 1;

    const prevFullmoveNumber = state.fullmoveNumber;
    if (mover === "black") state.fullmoveNumber += 1;

    const prevTurn = state.turn;
    state.turn = mover === "white" ? "black" : "white";

    state.zobristHash = hash;

    return {
        move, movedPiece, capturedPiece, capturedSquare, isEnPassant, castleRookMove,
        prevCastling, prevEnPassant, prevHalfmoveClock, prevFullmoveNumber, prevTurn,
        prevZobristHash,
    };
}

/** Reverses exactly what makeMoveInPlace did, using the UndoInfo it
 *  returned. Must be called with moves undone in strict LIFO order
 *  relative to how they were made (standard for a search stack). */
export function unmakeMove(state: Position, undo: UndoInfo): void {
    const [fromFile, fromRank] = squareToCoords(undo.move.from);
    const [toFile, toRank] = squareToCoords(undo.move.to);
    const board = state.board;

    setBoardPiece(board, toFile, toRank, null);
    setBoardPiece(board, fromFile, fromRank, undo.movedPiece);

    if (undo.capturedPiece) {
        setBoardPiece(board, undo.capturedSquare[0], undo.capturedSquare[1], undo.capturedPiece);
    }

    if (undo.castleRookMove) {
        const { from, to, piece } = undo.castleRookMove;
        setBoardPiece(board, to[0], to[1], null);
        setBoardPiece(board, from[0], from[1], piece);
    }

    state.castling = undo.prevCastling;
    state.enPassant = undo.prevEnPassant;
    state.halfmoveClock = undo.prevHalfmoveClock;
    state.fullmoveNumber = undo.prevFullmoveNumber;
    state.turn = undo.prevTurn;
    state.zobristHash = undo.prevZobristHash;
}

/** Public, immutable FEN-based move application (UI-facing) — now just a
 *  thin wrapper over the same make/unmake logic search uses, so there's
 *  a single source of truth for move execution. */
export function makeMove(state: EngineState, move: ChessMove): EngineState {
    const pos = toPosition(state);
    const undo = makeMoveInPlace(pos, move);

    return {
        fen: boardToFEN(pos.board, pos),
        turn: pos.turn,
        castling: pos.castling,
        enPassant: pos.enPassant,
        halfmoveClock: pos.halfmoveClock,
        fullmoveNumber: pos.fullmoveNumber,
        gameOver: false,
        moveHistory: [
            ...state.moveHistory,
            {
                from: move.from,
                to: move.to,
                promotion: move.promotion,
                capture: undo.capturedPiece !== null,
            },
        ],
    };
}

/**
 * Perft ("performance test"): counts leaf positions reachable in exactly
 * `depth` plies. This is the standard way chess engines validate a move
 * generator — known-correct values exist for the starting position, so a
 * mismatch pinpoints a bug in check/pin/castling/en-passant handling. It
 * also exercises makeMoveInPlace/unmakeMove in a tight loop, so it's a
 * good first thing to run after this refactor: for the starting position,
 * perft(state, 1) = 20, perft(state, 2) = 400, perft(state, 3) = 8902,
 * perft(state, 4) = 197281.
 */
export function perft(state: EngineState, depth: number): number {
    return perftFromPosition(toPosition(state), depth);
}

function perftFromPosition(state: Position, depth: number): number {
    if (depth === 0) return 1;
    let nodes = 0;
    for (const { moves } of generateLegalMoves(state)) {
        for (const move of moves) {
            const undo = makeMoveInPlace(state, move);
            nodes += perftFromPosition(state, depth - 1);
            unmakeMove(state, undo);
        }
    }
    return nodes;
}
