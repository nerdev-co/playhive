import type { LudoOptions, BoardSquare, LENGTH } from "./types";

export const CONFIG: Required<LudoOptions> = {
    openWith: [6],
    canRound: false,
    capture: false,
    position: "abcd//abcd/ a aa",
    state: "",
    historySize: 0,
};

export const BOARD: BoardSquare[] = Array.from({ length: 23 }, (_, index) => ({
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
    pieces: {},
}));

export const PIECES: Record<string, number[]> = {};

export const CAPTURED: Record<string, number> = {};

export const PLAYERS: string[] = [];

export const PLAYERS_WITH_ENDS: string[] = [];

export const HISTORY: string[] = [];

export const GAME_INFO = [0, 0, 0] as [number, number, number];

export const EVENTS: Record<string, Function> = {};

export const RANDOM_NUMS = [1, 2, 3, 4, 5, 6];