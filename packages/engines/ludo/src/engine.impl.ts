// @ts-nocheck
// Internal implementation ported from ludo.js - runtime validated, types relaxed for portability

import type { LudoOptions, LudoPiece, LudoSquare, LudoMove, LudoEvent, EngineState, EngineAction, EngineResult, MoveType } from "./types";
import { BOARD, CAPTURED, CONFIG, HISTORY, PIECES, PLAYERS, PLAYERS_WITH_ENDS, GAME_INFO, EVENTS, RANDOM_NUMS } from "./store";
import { codeFromChar, charFromCode, callListener, pieceAt, nextSquareIndex, getHistoryInfo, moveHelper, resetInit, prevSquareIndex } from "./helper";

export function initGame(options: LudoOptions = {}): string | void {
    Object.assign(CONFIG, options);
    if (options.state) {
        HISTORY.push(...options.state.split(" "));
    }

    const positionType = CONFIG.position!.split(" ");
    if (positionType.length !== 3) {
        return "Invalid 'options.position' given in '.init()'.";
    }

    const piecePositions = positionType[0].split("/");
    let positions = "";
    let homeCount = 0;
    let pieceCount = 0;
    let charCode: number;
    let index = 0;
    let currentChar = "";
    let currentHomeId = "";

    for (positions of piecePositions) {
        homeCount++;
        if (!positions) {
            continue;
        }

        currentChar = charFromCode(homeCount);
        if (currentChar === positionType[1]) {
            GAME_INFO[0] = PLAYERS.length;
        }

        PIECES[currentChar] = [0, 1, 2, 3];
        CAPTURED[currentChar] = 0;
        pieceCount = index = 0;

        while (index < positions.length) {
            const char = positions[index];
            if (char < "a" || char > "w") {
                return `Invalid piece position at '${char}'.`;
            }

            if (pieceCount === 4) {
                return `Player '${currentChar}' has more than 4 pieces.`;
            }

            PIECES[currentChar][pieceCount] = charCode = codeFromChar(positions, index);
            
            if (index + 1 < positions.length && positions[index + 1] >= "0" && positions[index + 1] <= "9") {
                currentHomeId = positions[index + 1];
                index++;
            } else {
                currentHomeId = (homeCount - 1).toString();
            }

            BOARD[charCode].pieces[currentChar + pieceCount] = parseInt(currentHomeId, 10);
            index++;

            callListener("add", {
                index: pieceCount++,
                name: currentChar,
                homeId: parseInt(currentHomeId, 10),
                position: charCode,
            } as LudoPiece);
        }

        if (PIECES[currentChar].every((idx) => idx === 22)) {
            PLAYERS_WITH_ENDS.push(currentChar);
        } else {
            PLAYERS.push(currentChar);
        }
    }

    index = 0;
    while (index < positionType[2].length) {
        currentChar = positionType[2][index];
        CAPTURED[charFromCode(++index)] = codeFromChar(currentChar);
    }

    GAME_INFO[2] = homeCount;
    if (!PLAYERS[GAME_INFO[0]]) {
        return "Unknown player turn.";
    }

    callListener("init");
    callListener("turn", PLAYERS[GAME_INFO[0]]);
}

export function getMoves(piece?: string, distance = 0): LudoMove[] | string {
    const playerName = piece || PLAYERS[GAME_INFO[0]];
    if (!PIECES[playerName] || distance > 6 || distance < 0) {
        return "Unknown player name or 'distance' is out of range.";
    }

    distance ||= RANDOM_NUMS[Math.floor(Math.random() * RANDOM_NUMS.length)];

    const player = PIECES[playerName];
    const pieceHomeId = codeFromChar(playerName);
    const moves: LudoMove[] = [];

    let index = 0;
    let isRepeat = false;
    let pieceIndex: number;
    let homeId: number;
    let totalDistance: number;
    let toIndex: number = 0;
    let toHomeId: number = 0;

    while (index < 4) {
        pieceIndex = player[index];
        totalDistance = pieceIndex < 4 ? 1 : distance;
        homeId = BOARD[pieceIndex].pieces[playerName + index];
        toIndex = pieceIndex;
        toHomeId = homeId;

        if (
            pieceIndex !== 22 &&
            (pieceIndex > 14 || pieceIndex < 10 || pieceIndex - distance > 8) &&
            (pieceIndex > 3 || CONFIG.openWith!.includes(distance))
        ) {
            while (totalDistance-- > 0) {
                [toIndex, toHomeId] = nextSquareIndex(toIndex, toHomeId, isRepeat ? -1 : pieceHomeId);
            }

            if (!(toIndex < 15 && toIndex > 9) || !CONFIG.capture || CAPTURED[playerName]) {
                const nextSquare = pieceAt(toIndex, toHomeId);
                if (nextSquare) {
                    moves.push({
                        capture: nextSquare.pieces.filter((p) => p.name !== playerName),
                        from: pieceAt(pieceIndex, homeId)!,
                        to: nextSquare,
                        isInitial: pieceIndex < 4,
                        isRepeat: isRepeat,
                        number: distance,
                        piece: { name: playerName, index: index },
                    });
                }
            }

            if ((isRepeat = (CONFIG.canRound as boolean && !isRepeat && toIndex > 9 && toIndex < 15))) {
                index--;
            }
        }
        index++;
    }

    return moves;
}

export function movePiece(move: LudoMove): string | void {
    const { from, to, piece } = move;
    const lastSquare = pieceAt(to.index, to.homeId);
    const capturedPieces = lastSquare && lastSquare.type === "safe" ? [] :
        lastSquare ? lastSquare.pieces.filter((p) => piece.name !== p.name) : [];

    if (!lastSquare || PLAYERS.length === 1) {
        return "Invalid move or game is already over.";
    }

    if (CONFIG.historySize) {
        const MOVE_INFO =
            piece.name + piece.index + move.number +
            (capturedPieces.length ? "." + capturedPieces[0].name + capturedPieces.map((p) => p.index).join("") : "") +
            (move.isInitial ? "~" : move.isRepeat ? "-" : "");

        if (GAME_INFO[1] < HISTORY.length) {
            HISTORY.length = GAME_INFO[1];
        }

        HISTORY.push(MOVE_INFO);
        if (CONFIG.historySize < HISTORY.length) {
            HISTORY.shift();
        } else {
            GAME_INFO[1]++;
        }
    }

    if (capturedPieces.length) {
        capturedPieces.forEach((p) => {
            CAPTURED[piece.name]++;
            moveHelper(p.name, p.index, to.index, to.homeId, p.index, codeFromChar(p.name), "capture");
        });
    }

    moveHelper(piece.name, piece.index, from.index, from.homeId, to.index, to.homeId, "move");

    if (to.index === 22) {
        callListener("finish", piece);
        if (PIECES[piece.name].every((idx) => idx === 22)) {
            PLAYERS_WITH_ENDS.push(piece.name);
            PLAYERS.splice(GAME_INFO[0], 1);
            GAME_INFO[0]--;
        }
    }

    if (PLAYERS.length === 1) {
        callListener("over", [...PLAYERS_WITH_ENDS], PLAYERS[0]);
    }

    callListener("turn", PLAYERS[GAME_INFO[0] = ++GAME_INFO[0] === PLAYERS.length ? 0 : GAME_INFO[0]]);
}

export function undoMove(): string | void {
    if (GAME_INFO[1] === 0) {
        return "No more undo.";
    }

    const historyInfo = getHistoryInfo(HISTORY[--GAME_INFO[1]]);
    if (!historyInfo) return "Invalid history.";

    const [, piece, indexStr, distanceStr, , capture, captureIndex, moveType] = historyInfo;
    const index = parseInt(indexStr, 10);
    const distance = parseInt(distanceStr, 10);

    const currentIndex = PIECES[piece][index];
    const currentHomeId = BOARD[currentIndex].pieces[piece + index];
    let toIndex = currentIndex;
    let distanceCovered = moveType === "~" ? 1 : distance;
    let toHomeId = currentHomeId;
    const isLastIndex = currentIndex === 22;

    while (distanceCovered-- > 0) {
        [toIndex, toHomeId] = prevSquareIndex(toIndex, toHomeId, moveType === "~" ? toHomeId : -1, index);
        if (toIndex < 4 && distanceCovered) {
            return "Invalid history move.";
        }
    }

    moveHelper(piece, index, currentIndex, currentHomeId, toIndex, toHomeId, "undo-move");

    if (capture && captureIndex) {
        captureIndex.split("").forEach((idxStr) => {
            const idx = parseInt(idxStr, 10);
            moveHelper(capture, idx, idx, codeFromChar(piece), currentIndex, currentHomeId, "undo-capture");
            CAPTURED[piece] = CAPTURED[piece] ? CAPTURED[piece] - 1 : 0;
        });
    }

    if (isLastIndex) {
        const idx = PLAYERS_WITH_ENDS.findIndex((player) => player === piece);
        if (idx !== -1) {
            PLAYERS_WITH_ENDS.splice(idx, 1);
            PLAYERS.push(piece);
            PLAYERS.sort();
        }
    }

    callListener("turn", PLAYERS[GAME_INFO[0] = --GAME_INFO[0] === -1 ? PLAYERS.length - 1 : GAME_INFO[0]]);
}

export function redoMove(): string | void {
    if (GAME_INFO[1] === HISTORY.length) {
        return "No more redo.";
    }

    const historyInfo = getHistoryInfo(HISTORY[GAME_INFO[1]]);
    if (!historyInfo) return "Invalid history.";

    const [, piece, indexStr, distanceStr, , , , moveType] = historyInfo;
    const index = parseInt(indexStr, 10);
    const distance = parseInt(distanceStr, 10);

    const currentIndex = PIECES[piece][index];
    const currentHomeId = BOARD[currentIndex].pieces[piece + index];

    let toIndex = currentIndex;
    let distanceCovered = moveType === "~" ? 1 : distance;
    let toHomeId = currentHomeId;

    while (distanceCovered-- > 0) {
        [toIndex, toHomeId] = nextSquareIndex(toIndex, toHomeId, moveType ? -1 : toHomeId);
        if (toIndex === 22 && distanceCovered) {
            return "Invalid history move.";
        }
    }

    movePiece({
        from: { homeId: currentHomeId, index: currentIndex },
        number: distance,
        piece: { index, name: piece },
        to: { homeId: toHomeId, index: toIndex },
    } as LudoMove);
}

export function getState(): string {
    return HISTORY.slice(0, GAME_INFO[1]).join(" ");
}

export function getPosition(): string {
    const pieceOrder: string[] = Array(GAME_INFO[2]);
    Object.keys(PIECES).forEach((piece) => {
        pieceOrder[codeFromChar(piece)] = piece;
    });

    return [
        pieceOrder.map((piece, _index): string => {
            return piece
                ? PIECES[piece].map((num, index) => {
                    const homeId = BOARD[num].pieces[charFromCode(_index + 1) + index];
                    return charFromCode(num + 1) + (homeId === _index ? "" : homeId);
                }).join("")
                : "";
        }).join("/"),
        PLAYERS[GAME_INFO[0]],
        pieceOrder.map((piece) => charFromCode(CAPTURED[piece] > 25 ? 26 : CAPTURED[piece] + 1)).join(""),
    ].join(" ");
}

export function getTurn(): string {
    return PLAYERS[GAME_INFO[0]];
}

export function getEngineState(): EngineState {
    return {
        position: getPosition(),
        history: getState(),
        turn: getTurn(),
        players: [...PLAYERS],
        playersWithEnds: [...PLAYERS_WITH_ENDS],
        captured: { ...CAPTURED },
        pieces: { ...PIECES },
        board: BOARD.map((sq) => ({ ...sq, pieces: { ...sq.pieces } })),
        gameInfo: [GAME_INFO[0], GAME_INFO[1], GAME_INFO[2]] as [number, number, number],
        config: { ...CONFIG },
        gameOver: PLAYERS.length === 1,
        winner: PLAYERS.length === 1 ? PLAYERS[0] : undefined,
        ranks: PLAYERS.length === 1 ? [...PLAYERS_WITH_ENDS, PLAYERS[0]] : undefined,
    };
}

export function applyAction(action: EngineAction): EngineResult {
    const events: LudoEvent[] = [];

    const tempEvents: Record<string, Function> = {
        add: (p: LudoPiece) => events.push({ add: () => {}, piece: p }),
        init: () => events.push({ init: () => {} }),
        over: (pieces: string[], lastPlayer: string) => events.push({ over: () => {}, pieces, lastPlayer }),
        finish: (p: LudoPiece) => events.push({ finish: () => {}, piece: p }),
        move: (p: LudoPiece, from: LudoSquare, to: LudoSquare, type: MoveType) =>
            events.push({ move: () => {}, piece: p, from, to, type }),
        turn: (p: string) => events.push({ turn: () => {}, piece: p }),
    };

    Object.entries(tempEvents).forEach(([key, handler]) => {
        EVENTS[key] = handler;
    });

    let error: string | void;

    if (action.type === "ROLL_DICE") {
        error = void 0;
    } else if (action.type === "MOVE_TOKEN") {
        const moves = getMoves(undefined, action.distance);
        if (typeof moves === "string") {
            error = moves;
        } else {
            const move = moves.find((m) => m.piece.index === action.token);
            if (!move) {
                error = "Invalid move for token";
            } else {
                error = movePiece(move);
            }
        }
    } else {
        error = "Unknown action type";
    }

    const state = getEngineState();
    const gameOver = state.gameOver;

    return {
        events,
        state,
        gameOver,
        result: gameOver ? {
            winner: state.winner || null,
            reason: "completed",
            ranks: state.ranks || [],
        } : undefined,
    };
}

export function createInitialState(settings: LudoOptions = {}): EngineState {
    resetInit();
    initGame(settings);
    return getEngineState();
}

export function legalActions(state: EngineState, seat: number): EngineAction[] {
    const playerName = state.players[seat];
    if (!playerName) return [];

    const moves = getMoves(playerName);
    if (typeof moves === "string") return [];

    return moves.map((move) => ({
        type: "MOVE_TOKEN" as const,
        token: move.piece.index,
        from: move.from.index,
        to: move.to.index,
        distance: move.number,
    }));
}

export function chooseBotAction(state: EngineState, seat: number): EngineAction {
    const actions = legalActions(state, seat);
    if (actions.length === 0) {
        return { type: "ROLL_DICE" };
    }
    return actions[Math.floor(Math.random() * actions.length)];
}