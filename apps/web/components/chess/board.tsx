"use client";

import { useState, useMemo } from "react";

const PIECE_SYMBOLS: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

function fenToBoard(fen: string): (string | null)[][] {
  const parts = fen.split(" ");
  const rows = (parts[0] ?? "").split("/");
  const board: (string | null)[][] = [];
  for (const row of rows) {
    const boardRow: (string | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) boardRow.push(null);
      } else {
        boardRow.push(ch);
      }
    }
    board.push(boardRow);
  }
  return board;
}

function squareColor(file: number, rank: number): "light" | "dark" {
  return (file + rank) % 2 === 0 ? "light" : "dark";
}

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
