"use client";

import { useState, useMemo, useCallback } from "react";
import { fenToBoard, PIECE_SYMBOLS, squareColor } from "@repo/chess";

interface ChessBoardProps {
  fen: string;
  turn: "white" | "black";
  legalMoves: { from: string; to: string; promotion?: string }[];
  lastMove?: { from: string; to: string } | null;
  inCheck?: boolean;
  orientation?: "white" | "black";
  disabled?: boolean;
  onMove: (from: string, to: string, promotion?: string) => void;
}

export function ChessBoard({
  fen,
  turn,
  legalMoves,
  lastMove = null,
  inCheck = false,
  orientation = "white",
  disabled = false,
  onMove,
}: ChessBoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const board = useMemo(() => fenToBoard(fen), [fen]);

  const legalMap = useMemo(() => {
    const map = new Map<string, { to: string; promotion?: string }[]>();
    for (const move of legalMoves) {
      const list = map.get(move.from) ?? [];
      list.push({ to: move.to, promotion: move.promotion });
      map.set(move.from, list);
    }
    return map;
  }, [legalMoves]);

  const files = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const ranks = orientation === "white" ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  const findKingSquare = useCallback(() => {
    const king = turn === "white" ? "K" : "k";
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        if (board[r]?.[f] === king) {
          return `${String.fromCharCode(97 + f)}${r + 1}`;
        }
      }
    }
    return null;
  }, [board, turn]);

  const kingSquare = inCheck ? findKingSquare() : null;

  const handleSquareClick = (file: number, rank: number) => {
    if (disabled) return;
    const sq = `${String.fromCharCode(97 + file)}${rank + 1}`;

    if (selected) {
      const targets = legalMap.get(selected) ?? [];
      const match = targets.find((t) => t.to === sq);
      if (match) {
        onMove(selected, sq, match.promotion);
        setSelected(null);
        return;
      }
    }

    const piece = board[rank]?.[file] ?? null;
    if (piece) {
      const isWhitePiece = piece === piece.toUpperCase();
      if ((isWhitePiece && turn === "white") || (!isWhitePiece && turn === "black")) {
        setSelected(sq);
        return;
      }
    }
    setSelected(null);
  };

  const handleDragStart = (e: React.DragEvent, file: number, rank: number) => {
    if (disabled) return;
    const sq = `${String.fromCharCode(97 + file)}${rank + 1}`;
    const piece = board[rank]?.[file] ?? null;
    if (!piece) return;
    const isWhitePiece = piece === piece.toUpperCase();
    if ((isWhitePiece && turn !== "white") || (!isWhitePiece && turn !== "black")) return;

    e.dataTransfer.setData("text/plain", sq);
    e.dataTransfer.effectAllowed = "move";
    setSelected(sq);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, file: number, rank: number) => {
    e.preventDefault();
    setDragOver(null);
    if (disabled) return;

    const from = e.dataTransfer.getData("text/plain");
    const to = `${String.fromCharCode(97 + file)}${rank + 1}`;

    if (from === to) return;

    const targets = legalMap.get(from) ?? [];
    const match = targets.find((t) => t.to === to);
    if (match) {
      onMove(from, to, match.promotion);
    }
    setSelected(null);
  };

  return (
    <div className="mx-auto w-fit select-none">
      <div className="relative">
        {/* Rank labels (left) */}
        <div className="absolute -left-5 top-0 flex h-full flex-col justify-around text-[10px] font-medium text-gray-500">
          {ranks.map((r) => (
            <div key={r} className="flex h-[12.5%] items-center">
              {r + 1}
            </div>
          ))}
        </div>

        {/* Board */}
        <div className="grid grid-cols-8 border border-gray-800 shadow-lg">
          {ranks.map((rank) =>
            files.map((file) => {
              const sq = `${String.fromCharCode(97 + file)}${rank + 1}`;
              const isLight = squareColor(file, rank) === "light";
              const isSelected = selected === sq;
              const isLegal = selected
                ? (legalMap.get(selected) ?? []).some((t) => t.to === sq)
                : false;
              const isCapture = isLegal && (board[rank]?.[file] ?? null) !== null;
              const isLastMove = lastMove?.from === sq || lastMove?.to === sq;
              const isKingInCheck = sq === kingSquare;

              let bg = isLight ? "bg-[#f0d9b5]" : "bg-[#b58863]";
              if (isSelected) bg = isLight ? "bg-[#f6f669]" : "bg-[#baca2b]";
              else if (isLastMove) bg = isLight ? "bg-[#f5f682]" : "bg-[#baca44]";
              else if (isKingInCheck) bg = "bg-[#e74c3c]";

              return (
                <div
                  key={sq}
                  className={`relative flex h-10 w-10 cursor-pointer items-center justify-center text-2xl sm:h-12 sm:w-12 sm:text-3xl md:h-14 md:w-14 md:text-4xl ${bg} transition-colors duration-75`}
                  onClick={() => handleSquareClick(file, rank)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, file, rank)}
                >
                  {isLegal && !isCapture && (
                    <div className="h-2.5 w-2.5 rounded-full bg-black/20 sm:h-3 sm:w-3" />
                  )}
                  {isLegal && isCapture && (
                    <div className="absolute inset-0 rounded-full border-[3px] border-black/20" />
                  )}
                  {board[rank]?.[file] ? (
                    <span
                      draggable={!disabled}
                      onDragStart={(e) => handleDragStart(e, file, rank)}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      {PIECE_SYMBOLS[board[rank]![file]!]}
                    </span>
                  ) : null}
                </div>
              );
            }),
          )}
        </div>

        {/* File labels (bottom) */}
        <div className="flex justify-around text-[10px] font-medium text-gray-500">
          {files.map((f) => (
            <div key={f} className="flex w-10 justify-center sm:w-12 md:w-14">
              {String.fromCharCode(97 + f)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
