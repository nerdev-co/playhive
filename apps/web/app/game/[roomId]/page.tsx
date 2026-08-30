"use client";

import { useState, useEffect, useCallback, use, useMemo } from "react";
import { ChessBoard } from "@/components/chess/board";
import { useWebSocket } from "@/lib/ws/hooks";
import { useTheme } from "@/lib/theme";
import { initGame, applyAction, legalActions, canClaimThreefold, isInCheck } from "@repo/chess";
import { PIECE_SYMBOLS } from "@repo/chess";
import type { EngineAction, EngineState } from "@repo/chess";

const START_COUNTS: Record<"q" | "r" | "b" | "n" | "p", number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const PIECE_VALUE: Record<"q" | "r" | "b" | "n" | "p", number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

function getCaptured(fen: string) {
  const boardPart = fen.split(" ")[0] ?? "";
  const white: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  const black: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const ch of boardPart) {
    const t = ch.toLowerCase();
    if (!(t in white)) continue;
    if (ch === t) {
      black[t] = (black[t] ?? 0) + 1;
    } else {
      white[t] = (white[t] ?? 0) + 1;
    }
  }
  const byWhite: string[] = [];
  const byBlack: string[] = [];
  let diff = 0;
  for (const t of ["q", "r", "b", "n", "p"] as const) {
    const blackMissing = START_COUNTS[t] - (black[t] ?? 0);
    const whiteMissing = START_COUNTS[t] - (white[t] ?? 0);
    for (let i = 0; i < blackMissing; i++) byWhite.push(t);
    for (let i = 0; i < whiteMissing; i++) byBlack.push(t);
    diff += (blackMissing - whiteMissing) * PIECE_VALUE[t];
  }
  return { byWhite, byBlack, diff };
}

function CapturedRow({ pieces, lead }: { pieces: string[]; lead?: number }) {
  if (!pieces.length && !lead) return null;
  return (
    <div className="mx-auto flex h-5 w-fit items-center gap-0.5 text-lg leading-none text-neutral-400">
      {pieces.map((p, i) => (
        <span key={i}>{PIECE_SYMBOLS[p]}</span>
      ))}
      {lead ? <span className="ml-1 text-[10px] font-medium text-neutral-500">+{lead}</span> : null}
    </div>
  );
}

export default function GamePage({ params }: { params: Promise<{ roomId: string }> }) {
  const { state: wsState, send, on } = useWebSocket();
  const { setTheme } = useTheme();
  const resolvedParams = use(params);
  const roomId = resolvedParams.roomId;

  useEffect(() => { setTheme("game"); }, [setTheme]);

  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [legalMoves, setLegalMoves] = useState<{ from: string; to: string; promotion?: string }[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [inCheck, setInCheck] = useState(false);
  const [pendingDrawOffer, setPendingDrawOffer] = useState(false);
  const [drawOfferFrom, setDrawOfferFrom] = useState<"white" | "black" | null>(null);

  useEffect(() => {
    const init = initGame();
    setEngineState(init);
    refreshLegalMoves(init);
  }, []);

  const refreshLegalMoves = useCallback((state: EngineState) => {
    const actions = legalActions();
    const moves = actions
      .filter((a): a is Extract<EngineAction, { type: "MOVE" }> => a.type === "MOVE")
      .map((a) => ({ from: a.from, to: a.to, promotion: a.promotion }));
    setLegalMoves(moves);
  }, []);

  const handleMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      if (!engineState || engineState.gameOver) return;
      const action: EngineAction = { type: "MOVE", from, to, promotion: promotion as "q" | "r" | "b" | "n" | undefined };
      const result = applyAction(action);

      setLastMove({ from, to });
      setInCheck(isInCheck(result.state));
      setEngineState(result.state);
      refreshLegalMoves(result.state);
      setPendingDrawOffer(false);
      setDrawOfferFrom(null);

      send({ v: 1, type: "GAME_ACTION", roomId, payload: { seat: 0, action } });
    },
    [engineState, roomId, refreshLegalMoves, send],
  );

  const handleResign = useCallback(() => {
    if (!engineState || engineState.gameOver) return;
    const action: EngineAction = { type: "RESIGN" };
    const result = applyAction(action);
    setEngineState(result.state);
    setLastMove(null);
    send({ v: 1, type: "GAME_ACTION", roomId, payload: { seat: 0, action } });
  }, [engineState, roomId, send]);

  const handleDrawOffer = useCallback(() => {
    if (!engineState || engineState.gameOver || pendingDrawOffer) return;
    const action: EngineAction = { type: "DRAW_OFFER" };
    const result = applyAction(action);
    setEngineState(result.state);
    setPendingDrawOffer(true);
    refreshLegalMoves(result.state);
    send({ v: 1, type: "GAME_ACTION", roomId, payload: { seat: 0, action } });
  }, [engineState, pendingDrawOffer, roomId, refreshLegalMoves, send]);

  const handleDrawRespond = useCallback(
    (accept: boolean) => {
      if (!engineState) return;
      const action: EngineAction = { type: accept ? "DRAW_ACCEPT" : "DRAW_DECLINE" };
      const result = applyAction(action);
      setEngineState(result.state);
      setDrawOfferFrom(null);
      setPendingDrawOffer(false);
      refreshLegalMoves(result.state);
      send({ v: 1, type: "GAME_ACTION", roomId, payload: { seat: 0, action } });
    },
    [engineState, roomId, refreshLegalMoves, send],
  );

  if (!engineState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
      </div>
    );
  }

  const isGameOver = engineState.gameOver;
  const canThreefold = !isGameOver && canClaimThreefold();
  const resultText = isGameOver
    ? engineState.result === "draw"
      ? `Draw — ${engineState.resultReason}`
      : `${engineState.result === "white" ? "White" : "Black"} wins — ${engineState.resultReason}`
    : null;

  const captured = useMemo(() => getCaptured(engineState.fen), [engineState.fen]);

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-8 lg:flex-row lg:items-start lg:gap-8">
      {/* Board */}
      <div className="flex-1">
        <CapturedRow pieces={captured.byBlack} lead={captured.diff < 0 ? -captured.diff : undefined} />
        <div className="my-1">
          <ChessBoard
            fen={engineState.fen}
            turn={engineState.turn}
            legalMoves={legalMoves}
            lastMove={lastMove}
            inCheck={inCheck}
            onMove={handleMove}
            disabled={isGameOver}
          />
        </div>
        <CapturedRow pieces={captured.byWhite} lead={captured.diff > 0 ? captured.diff : undefined} />
      </div>

      {/* Sidebar */}
      <div className="w-full space-y-4 lg:w-56">
        {/* Header */}
        <div className="animate-fade-in">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold text-white">Chess</h1>
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono text-neutral-500">
              {roomId.slice(0, 8)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500">
            <span className={`h-1 w-1 rounded-full ${wsState === "open" ? "bg-emerald-500" : "bg-red-500"}`} />
            {wsState}
          </div>
        </div>

        {/* Turn */}
        <div className="animate-fade-in delay-1 flex items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
          <div className={`flex h-7 w-7 items-center justify-center rounded-md border text-[11px] font-bold ${engineState.turn === "white" ? "border-neutral-300 bg-white text-neutral-900" : "border-neutral-600 bg-neutral-800 text-white"}`}>
            {engineState.turn === "white" ? "W" : "B"}
          </div>
          <div>
            <p className="text-xs font-medium text-white capitalize">{engineState.turn} to move</p>
            <p className="text-[10px] text-neutral-500">Move {engineState.fullmoveNumber}</p>
          </div>
        </div>

        {/* Result */}
        {resultText && (
          <div className="animate-scale-in rounded-lg border border-amber-800/30 bg-amber-500/10 px-3 py-2.5 text-xs font-medium text-amber-400">
            {resultText}
          </div>
        )}

        {/* Draw offer */}
        {drawOfferFrom && (
          <div className="animate-scale-in rounded-lg border border-indigo-800/30 bg-indigo-500/10 p-3">
            <p className="mb-2 text-[11px] font-medium text-indigo-400">Draw offered</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDrawRespond(true)}
                className="rounded-md bg-indigo-500 px-3 py-1 text-[11px] font-medium text-white transition-all duration-150 hover:bg-indigo-400 active:scale-[0.98]"
              >
                Accept
              </button>
              <button
                onClick={() => handleDrawRespond(false)}
                className="rounded-md border border-neutral-700 px-3 py-1 text-[11px] font-medium text-neutral-400 transition-colors hover:text-white"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!isGameOver && (
          <div className="animate-fade-in delay-2 space-y-1.5">
            {canThreefold && (
              <button
                onClick={() => {
                  const action: EngineAction = { type: "DRAW_ACCEPT" };
                  const result = applyAction(action);
                  setEngineState(result.state);
                  refreshLegalMoves(result.state);
                  send({ v: 1, type: "GAME_ACTION", roomId, payload: { seat: 0, action } });
                }}
                className="w-full rounded-lg border border-emerald-800/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-400 transition-all duration-150 hover:bg-emerald-500/20 active:scale-[0.98]"
              >
                Claim Draw (3-fold)
              </button>
            )}
            <button
              onClick={handleDrawOffer}
              disabled={pendingDrawOffer}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-[11px] font-medium text-neutral-400 transition-all duration-150 hover:border-neutral-700 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pendingDrawOffer ? "Offered..." : "Offer Draw"}
            </button>
            <button
              onClick={handleResign}
              className="w-full rounded-lg border border-red-900/30 bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-400 transition-all duration-150 hover:bg-red-500/20 active:scale-[0.98]"
            >
              Resign
            </button>
          </div>
        )}

        {/* Move list */}
        {engineState.moveHistory.length > 0 && (
          <div className="animate-fade-in delay-3">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-neutral-600">
              Moves
            </p>
            <div className="max-h-48 space-y-px overflow-y-auto font-mono text-[11px]">
              {Array.from({ length: Math.ceil(engineState.moveHistory.length / 2) }, (_, i) => {
                const white = engineState.moveHistory[i * 2];
                const black = engineState.moveHistory[i * 2 + 1];
                return (
                  <div key={i} className="flex gap-2 py-0.5">
                    <span className="w-5 text-neutral-600">{i + 1}.</span>
                    <span className="w-14 text-neutral-300">{white?.san ?? ""}</span>
                    <span className="w-14 text-neutral-500">{black?.san ?? ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
