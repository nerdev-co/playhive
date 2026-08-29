// @ts-nocheck
import type { LudoEvent, LudoPiece, LudoSquare, MoveType } from "./types";
import { BOARD, CAPTURED, CONFIG, GAME_INFO, PIECES, PLAYERS, PLAYERS_WITH_ENDS, HISTORY, EVENTS } from "./store";

export function codeFromChar(string: string, delimeter = 0): number {
    return string.charCodeAt(delimeter) - 97;
}

export function charFromCode(code: number): string {
    return String.fromCharCode(code + 96);
}

export function addListener<E extends keyof LudoEvent>(
    event: E,
    handler: LudoEvent[E]
): void {
    EVENTS[event] = handler;
}

export function callListener<E extends keyof LudoEvent>(
    event: E,
    ...args: unknown[]
): void {
    const handler = EVENTS[event];
    if (handler) handler(...args);
}

export function pieceAt(
    squareIndex: number,
    homeId = -1
): LudoSquare | null {
    if (squareIndex < 0 || squareIndex > 22 || (homeId !== -1 && homeId >= GAME_INFO[2])) {
        return null;
    }

    const square = BOARD[squareIndex];
    const pieces: Omit<LudoPiece, "position" | "homeId">[] = [];

    for (const pieceKey in square.pieces) {
        const pieceHomeId = square.pieces[pieceKey];
        if (homeId < 0 || homeId === pieceHomeId) {
            if (pieceKey.length >= 2) {
                pieces.push({
                    name: pieceKey[0],
                    index: parseInt(pieceKey[1], 10),
                    ...(homeId >= 0 ? {} : { homeId: pieceHomeId }),
                });
            }
        }
    }

    return {
        type: square.type,
        homeId,
        index: squareIndex,
        pieces,
    };
}

export function squareOf(pieceName: string, index: number): LudoSquare | null {
    if (!PIECES[pieceName] || index < 0 || index > 3) {
        return null;
    }

    const squareIndex = PIECES[pieceName][index];
    const square = BOARD[squareIndex];
    const pieceKey = pieceName + index;
    const pieceHomeId = square.pieces[pieceKey];

    return pieceAt(squareIndex, pieceHomeId);
}

export function nextSquareIndex(
    squareIndex: number,
    homeId: number,
    ownHomeId: number
): [number, number] {
    return [
        squareIndex === 10 || squareIndex === 22
            ? 22
            : squareIndex === 16
                ? 4
                : squareIndex === 9
                    ? 15
                    : squareIndex < 4
                        ? 20
                        : ownHomeId !== homeId && squareIndex === 15
                            ? 21
                            : squareIndex < 10
                                ? squareIndex + 1
                                : squareIndex - 1,
        squareIndex === 16 ? (homeId + 1 === GAME_INFO[2] ? 0 : homeId + 1) : homeId,
    ];
}

export function prevSquareIndex(
    squareIndex: number,
    homeId: number,
    ownHomeId: number,
    pieceIndex: number
): [number, number] {
    return [
        squareIndex === 22
            ? 10
            : squareIndex === 15
                ? 9
                : squareIndex === 21
                    ? 15
                    : squareIndex === 4
                        ? 16
                        : (squareIndex === 20 || squareIndex < 4) && ownHomeId === homeId
                            ? pieceIndex
                            : squareIndex < 10
                                ? squareIndex - 1
                                : squareIndex + 1,
        squareIndex === 4 ? (homeId === 0 ? GAME_INFO[2] - 1 : homeId - 1) : homeId,
    ];
}

export function getHistoryInfo(history: string): RegExpExecArray | null {
    return /(\w)(\d)(\d)(\.(\w)(\d+))?(~|-)?/.exec(history);
}

export function moveHelper(
    piece: string,
    index: number,
    fromIndex: number,
    fromHomeId: number,
    toIndex: number,
    toHomeId: number,
    type: MoveType
): void {
    const from = pieceAt(fromIndex, fromHomeId);
    const to = pieceAt(toIndex, toHomeId);

    if (!PIECES[piece]) PIECES[piece] = [0, 1, 2, 3];

    delete BOARD[fromIndex].pieces[piece + index];
    BOARD[toIndex].pieces[piece + index] = toHomeId;
    PIECES[piece][index] = toIndex;
    callListener("move", { name: piece, index }, from, to, type);
}

export function resetInit(): void {
    Object.keys(PIECES).forEach((key) => delete PIECES[key]);
    Object.keys(CAPTURED).forEach((key) => delete CAPTURED[key]);
    GAME_INFO[0] = 0;
    GAME_INFO[1] = 0;
    PLAYERS.length = 0;
    PLAYERS_WITH_ENDS.length = 0;
    HISTORY.length = 0;

    BOARD.forEach((_, index) => {
        BOARD[index] = {
            pieces: {},
            type:
                index === 22
                    ? "goal"
                    : index === 20 || index === 7
                        ? "safe"
                        : index > 9 && index < 15
                            ? "safe-end"
                            : index === 15
                                ? "safe-way"
                                : index < 4
                                    ? "home"
                                    : index === 16
                                        ? "left-way"
                                        : index === 21 || index === 9
                                            ? "right-way"
                                            : "normal",
        };
    });

    Object.assign(CONFIG, {
        openWith: [6],
        canRound: false,
        capture: false,
        position: "abcd//abcd/ a aa",
        state: "",
        historySize: 0,
    });
}