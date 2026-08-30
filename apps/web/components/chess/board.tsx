"use client";

import { useState, useMemo, useCallback } from "react";
import { fenToBoard, PIECE_SYMBOLS, squareColor } from "@repo/chess";

const SQUARE_LIGHT = "#e8dcc8";
const SQUARE_DARK = "#8b6d4f";
const SQUARE_SELECTED_LIGHT = "#f6f669";
const SQUARE_SELECTED_DARK = "#baca2b";
const SQUARE_LASTMOVE_LIGHT = "#f5f682";
const SQUARE_LASTMOVE_DARK = "#baca44";
const SQUARE_CHECK = "#e74c3c";
const SQUARE_LEGAL = "rgba(0,0,0,0.25)";
const SQUARE_CAPTURE = "rgba(0,0,0,0.3)";

const PROMOTION_PIECES = ["q", "r", "b", "n"] as const;

interface PendingPromotion {
  from: string;
  to: string;
}

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
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
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

  const isPromotionMove = useCallback(
    (from: string, to: string): boolean => {
      const rank = parseInt(from[1]) - 1;
      const file = from.charCodeAt(0) - 97;
      const piece = board[rank]?.[file];
      if (!piece) return false;
      const isWhite = piece === piece.toUpperCase();
      const promoRank = isWhite ? "8" : "1";
      return piece.toLowerCase() === "p" && to[1] === promoRank;
    },
    [board],
  );

  const handlePromotionSelect = (piece: string) => {
    if (!pendingPromotion) return;
    onMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
    setSelected(null);
  };

  const handleSquareClick = (file: number, rank: number) => {
    if (disabled) return;
    const sq = `${String.fromCharCode(97 + file)}${rank + 1}`;

    if (selected) {
      const targets = legalMap.get(selected) ?? [];
      const match = targets.find((t) => t.to === sq);
      if (match) {
        if (isPromotionMove(selected, sq)) {
          setPendingPromotion({ from: selected, to: sq });
        } else {
          onMove(selected, sq, match.promotion);
          setSelected(null);
        }
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
    if (disabled) return;

    const from = e.dataTransfer.getData("text/plain");
    const to = `${String.fromCharCode(97 + file)}${rank + 1}`;

    if (from === to) return;

    const targets = legalMap.get(from) ?? [];
    const match = targets.find((t) => t.to === to);
    if (match) {
      if (isPromotionMove(from, to)) {
        setPendingPromotion({ from, to });
      } else {
        onMove(from, to, match.promotion);
      }
    }
    setSelected(null);
  };

  const getSquareBg = (file: number, rank: number, sq: string): string => {
    const isLight = squareColor(file, rank) === "light";
    if (selected === sq) return isLight ? SQUARE_SELECTED_LIGHT : SQUARE_SELECTED_DARK;
    if (lastMove?.from === sq || lastMove?.to === sq) return isLight ? SQUARE_LASTMOVE_LIGHT : SQUARE_LASTMOVE_DARK;
    if (sq === kingSquare) return SQUARE_CHECK;
    return isLight ? SQUARE_LIGHT : SQUARE_DARK;
  };

  return (
    <div className="mx-auto w-fit select-none">
      <div className="relative">
        {/* Rank labels */}
        <div className="absolute -left-5 top-0 flex h-full flex-col justify-around text-[10px] font-medium text-neutral-500">
          {ranks.map((r) => (
            <div key={r} className="flex h-[12.5%] items-center">{r + 1}</div>
          ))}
        </div>

        {/* Board */}
        <div className="relative grid grid-cols-8 rounded-sm overflow-hidden shadow-lg" style={{ border: "1px solid #27272a" }}>
          {ranks.map((rank) =>
            files.map((file) => {
              const sq = `${String.fromCharCode(97 + file)}${rank + 1}`;
              const bg = getSquareBg(file, rank, sq);
              const isLegal = selected
                ? (legalMap.get(selected) ?? []).some((t) => t.to === sq)
                : false;
              const isCapture = isLegal && (board[rank]?.[file] ?? null) !== null;
              return (
                <div
                  key={sq}
                  className="relative flex h-11 w-11 cursor-pointer items-center justify-center text-3xl sm:h-13 sm:w-13 sm:text-4xl md:h-14 md:w-14 md:text-4xl transition-colors duration-75"
                  style={{ backgroundColor: bg }}
                  onClick={() => handleSquareClick(file, rank)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, file, rank)}
                >
                  {isLegal && !isCapture && (
                    <div
                      className="absolute rounded-full"
                      style={{ width: 10, height: 10, backgroundColor: SQUARE_LEGAL }}
                    />
                  )}
                  {isLegal && isCapture && (
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{ border: `3px solid ${SQUARE_CAPTURE}` }}
                    />
                  )}
                  {board[rank]?.[file] ? (
                    <span
                      draggable={!disabled}
                      onDragStart={(e) => handleDragStart(e, file, rank)}
                      className={`cursor-grab active:cursor-grabbing select-none ${
                        board[rank]![file] === "p" ? "text-[0.75em]" : ""
                      }`}
                      style={{
                        color: board[rank]![file] === board[rank]![file]!.toUpperCase() ? "#ffffff" : "#1a1a1a",
                        textShadow: board[rank]![file] === board[rank]![file]!.toUpperCase()
                          ? "0 1px 3px rgba(0,0,0,0.5)"
                          : "0 1px 2px rgba(255,255,255,0.3)",
                      }}
                    >
                      {PIECE_SYMBOLS[board[rank]![file]!]}
                    </span>
                  ) : null}
                </div>
              );
            }),
          )}

          {/* Promotion picker overlay */}
          {pendingPromotion && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/50"
              onClick={() => setPendingPromotion(null)}
            >
              <div
                className="flex gap-1 rounded-lg border border-neutral-700 bg-neutral-900 p-2 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                {PROMOTION_PIECES.map((piece) => {
                  const pieceChar = turn === "white" ? piece.toUpperCase() : piece;
                  return (
                    <button
                      key={piece}
                      onClick={() => handlePromotionSelect(piece)}
                      className="flex h-12 w-12 items-center justify-center rounded-md text-2xl transition-all duration-150 hover:bg-neutral-700 active:scale-95 sm:h-14 sm:w-14 sm:text-3xl"
                      style={{
                        color: turn === "white" ? "#ffffff" : "#1a1a1a",
                        textShadow: turn === "white"
                          ? "0 1px 3px rgba(0,0,0,0.5)"
                          : "0 1px 2px rgba(255,255,255,0.3)",
                      }}
                    >
                      {PIECE_SYMBOLS[pieceChar]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* File labels */}
        <div className="flex justify-around text-[10px] font-medium text-neutral-500">
          {files.map((f) => (
            <div key={f} className="flex w-11 justify-center sm:w-13 md:w-14">
              {String.fromCharCode(97 + f)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
