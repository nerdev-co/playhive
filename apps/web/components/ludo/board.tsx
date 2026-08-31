"use client";

import type { EngineState as LudoState } from "@playhive/ludo";

const PLAYER_COLORS: Record<
    string,
    { bg: string; text: string; border: string }
> = {
    a: { bg: "bg-red-500", text: "text-white", border: "border-red-400" },
    b: { bg: "bg-blue-500", text: "text-white", border: "border-blue-400" },
    c: {
        bg: "bg-emerald-500",
        text: "text-white",
        border: "border-emerald-400",
    },
    d: { bg: "bg-amber-500", text: "text-white", border: "border-amber-400" },
};

const PLAYER_LABELS: Record<string, string> = {
    a: "Red",
    b: "Blue",
    c: "Green",
    d: "Yellow",
};

interface LudoBoardProps {
    state: LudoState;
    onAction: (action: {
        type: string;
        token?: number;
        distance?: number;
    }) => void;
    disabled?: boolean;
    mySeat?: number;
}

export function LudoBoard({
    state,
    onAction,
    disabled,
    mySeat,
}: LudoBoardProps) {
    const currentPlayer = state.players[state.gameInfo[0]] ?? "a";
    const isMyTurn =
        mySeat !== undefined && state.players[mySeat] === currentPlayer;

    return (
        <div className="flex flex-col items-center gap-4">
            {/* Turn indicator */}
            <div className="flex items-center gap-2">
                <div
                    className={`h-3 w-3 rounded-full ${PLAYER_COLORS[currentPlayer]?.bg ?? "bg-neutral-500"}`}
                />
                <span className="text-sm font-medium text-neutral-300">
                    {PLAYER_LABELS[currentPlayer] ?? currentPlayer}&apos;s turn
                </span>
                {isMyTurn && (
                    <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">
                        You
                    </span>
                )}
            </div>

            {/* Board */}
            <div className="relative rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div
                    className="grid grid-cols-15 grid-rows-15 gap-px"
                    style={{ width: 360, height: 360 }}
                >
                    {/* Simplified cross-shaped board */}
                    {Array.from({ length: 15 * 15 }, (_, i) => {
                        const row = Math.floor(i / 15);
                        const col = i % 15;
                        const square = getSquareForPosition(row, col);
                        if (square === null) return <div key={i} />;

                        const pieces = state.board[square]?.pieces ?? [];
                        const pieceKeys = Object.keys(pieces);
                        const squareType =
                            state.board[square]?.type ?? "normal";

                        return (
                            <div
                                key={i}
                                className={`flex items-center justify-center rounded-sm text-[10px] ${
                                    squareType === "home"
                                        ? "bg-neutral-800"
                                        : squareType === "goal"
                                          ? "bg-amber-500/30"
                                          : squareType === "safe"
                                            ? "bg-emerald-500/20"
                                            : squareType === "safe-end"
                                              ? "bg-emerald-500/10"
                                              : "bg-neutral-800/50"
                                }`}
                            >
                                {pieceKeys.length > 0 && (
                                    <div className="flex flex-wrap gap-0.5">
                                        {pieceKeys.slice(0, 2).map((key) => {
                                            const playerName = key[0] ?? "a";
                                            const colors = PLAYER_COLORS[
                                                playerName
                                            ] ?? {
                                                bg: "bg-neutral-500",
                                                text: "text-white",
                                                border: "border-neutral-400",
                                            };
                                            return (
                                                <div
                                                    key={key}
                                                    className={`flex h-4 w-4 items-center justify-center rounded-full border text-[8px] font-bold ${colors.bg} ${colors.text} ${colors.border}`}
                                                >
                                                    {key[1]}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Players */}
            <div className="flex gap-3">
                {state.players.map((p, i) => {
                    const colors = PLAYER_COLORS[p] ?? {
                        bg: "bg-neutral-500",
                        text: "text-white",
                        border: "border-neutral-400",
                    };
                    const isActive = i === state.gameInfo[0];
                    return (
                        <div
                            key={p}
                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${
                                isActive
                                    ? `${colors.border} ${colors.bg}/20 ${colors.text}`
                                    : "border-neutral-800 text-neutral-500"
                            }`}
                        >
                            <div
                                className={`h-2 w-2 rounded-full ${colors.bg}`}
                            />
                            {PLAYER_LABELS[p] ?? p}
                        </div>
                    );
                })}
            </div>

            {/* Captured */}
            {Object.entries(state.captured).filter(([, v]) => v > 0).length >
                0 && (
                <div className="text-[10px] text-neutral-500">
                    Captured:{" "}
                    {Object.entries(state.captured)
                        .filter(([, v]) => v > 0)
                        .map(([k, v]) => `${PLAYER_LABELS[k] ?? k}: ${v}`)
                        .join(", ")}
                </div>
            )}

            {/* Game over */}
            {state.gameOver && (
                <div className="rounded-lg border border-amber-800/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400">
                    {state.winner
                        ? `${PLAYER_LABELS[state.winner] ?? state.winner} wins!`
                        : "Game over"}
                </div>
            )}
        </div>
    );
}

/**
 * Maps a (row, col) position on a 15x15 grid to a ludo square index.
 * This is a simplified mapping for the cross-shaped board.
 */
function getSquareForPosition(row: number, col: number): number | null {
    // Center goal area
    if (row >= 6 && row <= 8 && col >= 6 && col <= 8) {
        if (row === 7 && col === 7) return 22; // Goal
        return null;
    }

    // Top arm (rows 0-5, cols 6-8)
    if (row <= 5 && col >= 6 && col <= 8) {
        if (row === 0) return col === 6 ? 0 : col === 7 ? 1 : 2;
        if (row === 5 && col === 7) return 9; // Entry to home stretch
        if (row >= 1 && row <= 4 && col === 6) return 4 + (row - 1);
        if (row >= 1 && row <= 4 && col === 8) return 8 - (row - 1);
        return null;
    }

    // Bottom arm (rows 9-14, cols 6-8)
    if (row >= 9 && col >= 6 && col <= 8) {
        if (row === 14) return col === 6 ? 3 : col === 7 ? 4 : 5;
        if (row === 9 && col === 7) return 10; // Entry to home stretch
        return null;
    }

    // Left arm (rows 6-8, cols 0-5)
    if (row >= 6 && row <= 8 && col <= 5) {
        if (col === 0) return row === 6 ? 0 : row === 7 ? 3 : 4;
        if (col === 5 && row === 7) return 15; // Entry to home stretch
        return null;
    }

    // Right arm (rows 6-8, cols 9-14)
    if (row >= 6 && row <= 8 && col >= 9) {
        if (col === 14) return row === 6 ? 2 : row === 7 ? 5 : 3;
        if (col === 9 && row === 7) return 16; // Entry to home stretch
        return null;
    }

    return null;
}
