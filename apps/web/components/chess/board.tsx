"use client";

import { useState, useMemo } from "react";
import { fenToBoard, PIECE_SYMBOLS, squareColor } from "@repo/chess";

export function ChessBoard({
  fen,
  turn,
  legalMoves,
  onMove,
}: {
  fen: string;
  turn: "white" | "black";
  legalMoves: { from: string; to: string; promotion?: string }[];
  onMove: (from: string, to: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const board = useMemo(() => fenToBoard(fen), [fen]);
  const legalMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const move of legalMoves) {
      const list = map.get(move.from) ?? [];
      list.push(move.to);
      map.set(move.from, list);
    }
    return map;
  }, [legalMoves]);

  const handleSquareClick = (file: number, rank: number) => {
    const sq = `${String.fromCharCode(97 + file)}${rank + 1}`;
    if (selected) {
      const targets = legalMap.get(selected) ?? [];
      if (targets.includes(sq)) {
        onMove(selected, sq);
        setSelected(null);
        return;
      }
    }
    const piece = board[rank]?.[file] ?? null;
    if (piece) {
      const isWhite = piece === piece.toUpperCase();
      if ((isWhite && turn === "white") || (!isWhite && turn === "black")) {
        setSelected(sq);
        return;
      }
    }
    setSelected(null);
  };

  return (
    <div className="mx-auto w-fit">
      <div className="grid grid-cols-8 border-2 border-gray-900">
        {board.map((row, rank) =>
          row.map((piece, file) => {
            const sq = `${String.fromCharCode(97 + file)}${rank + 1}`;
            const isLight = squareColor(file, rank) === "light";
            const isSelected = selected === sq;
            const isLegal = selected ? (legalMap.get(selected) ?? []).includes(sq) : false;

            return (
              <button
                key={sq}
                onClick={() => handleSquareClick(file, rank)}
                className={`flex h-10 w-10 items-center justify-center text-xl sm:h-12 sm:w-12 sm:text-2xl ${
                  isLight ? "bg-amber-100" : "bg-amber-700"
                } ${isSelected ? "ring-2 ring-blue-500 ring-inset" : ""} ${
                  isLegal ? "relative after:absolute after:h-2 after:w-2 after:rounded-full after:bg-black/30" : ""
                }`}
              >
                {piece ? PIECE_SYMBOLS[piece] : null}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
