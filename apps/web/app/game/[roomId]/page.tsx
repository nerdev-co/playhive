"use client";

import { useState, useEffect, useCallback, use } from "react";
import { ChessBoard } from "@/components/chess/board";
import { useWebSocket } from "@/lib/ws/hooks";
import { useTheme } from "@/lib/theme";
import { initGame, applyAction, legalActions, canClaimThreefold } from "@repo/chess";
import type { EngineAction, EngineState } from "@repo/chess";

export default function GamePage({ params }: { params: Promise<{ roomId: string }> }) {
  const { state: wsState, send, on } = useWebSocket();
  const { setTheme } = useTheme();
  const resolvedParams = use(params);
  const roomId = resolvedParams.roomId;

  useEffect(() => {
    setTheme("game");
  }, [setTheme]);
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [legalMoves, setLegalMoves] = useState<{ from: string; to: string; promotion?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
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
      const promo = promotion ?? (engineState.turn === "white" && to[1] === "8" ? "q" : engineState.turn === "black" && to[1] === "1" ? "q" : undefined);
      const action: EngineAction = { type: "MOVE", from, to, promotion: promo as "q" | "r" | "b" | "n" | undefined };
      const result = applyAction(action);

      setLastMove({ from, to });
      setInCheck(result.state.turn === "white" ? isCheckState(result.state, "black") : isCheckState(result.state, "white"));
      setEngineState(result.state);
      refreshLegalMoves(result.state);
      setPendingDrawOffer(false);
      setDrawOfferFrom(null);

      send({
        v: 1,
        type: "GAME_ACTION",
        roomId,
        payload: { seat: 0, action },
      });
    },
    [engineState, roomId, refreshLegalMoves, send],
  );

  const handleResign = useCallback(() => {
    if (!engineState || engineState.gameOver) return;
    const action: EngineAction = { type: "RESIGN" };
    const result = applyAction(action);
    setEngineState(result.state);
    setLastMove(null);
    send({
      v: 1,
      type: "GAME_ACTION",
      roomId,
      payload: { seat: 0, action },
    });
  }, [engineState, roomId, send]);

  const handleDrawOffer = useCallback(() => {
    if (!engineState || engineState.gameOver || pendingDrawOffer) return;
    const action: EngineAction = { type: "DRAW_OFFER" };
    const result = applyAction(action);
    setEngineState(result.state);
    setPendingDrawOffer(true);
    refreshLegalMoves(result.state);
    send({
      v: 1,
      type: "GAME_ACTION",
      roomId,
      payload: { seat: 0, action },
    });
  }, [engineState, pendingDrawOffer, roomId, refreshLegalMoves, send]);

  const handleDrawRespond = useCallback(
    (accept: boolean) => {
      if (!engineState) return;
      const actionType = accept ? "DRAW_ACCEPT" : "DRAW_DECLINE";
      const action: EngineAction = { type: actionType as "DRAW_ACCEPT" | "DRAW_DECLINE" };
      const result = applyAction(action);
      setEngineState(result.state);
      setDrawOfferFrom(null);
      setPendingDrawOffer(false);
      refreshLegalMoves(result.state);
      send({
        v: 1,
        type: "GAME_ACTION",
        roomId,
        payload: { seat: 0, action },
      });
    },
    [engineState, roomId, refreshLegalMoves, send],
  );

  if (!engineState) {
    return <div className="flex min-h-screen items-center justify-center text-gray-400">Loading game...</div>;
  }

  const isGameOver = engineState.gameOver;
  const canThreefold = !isGameOver && canClaimThreefold();
  const resultText = isGameOver
    ? engineState.result === "draw"
      ? `Draw — ${engineState.resultReason}`
      : `${engineState.result === "white" ? "White" : "Black"} wins — ${engineState.resultReason}`
    : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 lg:flex-row lg:items-start lg:gap-8">
      {/* Board area */}
      <div className="flex-1">
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

      {/* Sidebar */}
      <div className="w-full space-y-4 lg:w-72">
        {/* Room info */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-400">Room {roomId}</p>
          <h1 className="mt-1 text-lg font-semibold">Chess</h1>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className={`inline-block h-2 w-2 rounded-full ${wsState === "open" ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-gray-500 capitalize">{wsState}</span>
          </div>
        </div>

        {/* Turn indicator */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${engineState.turn === "white" ? "bg-gray-100 text-gray-800" : "bg-gray-800 text-white"}`}>
              {engineState.turn === "white" ? "W" : "B"}
            </div>
            <div>
              <p className="text-sm font-medium capitalize">{engineState.turn} to move</p>
              <p className="text-xs text-gray-400">Move {engineState.fullmoveNumber}</p>
            </div>
          </div>
        </div>

        {/* Result banner */}
        {resultText && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">
            <p className="text-sm font-semibold">{resultText}</p>
          </div>
        )}

        {/* Draw offer from opponent */}
        {drawOfferFrom && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
            <p className="mb-3 text-sm text-blue-700">Opponent offers a draw</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDrawRespond(true)}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                Accept
              </button>
              <button
                onClick={() => handleDrawRespond(false)}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* Game controls */}
        {!isGameOver && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">Actions</p>
            <div className="space-y-2">
              {canThreefold && (
                <button
                  onClick={() => {
                    const action: EngineAction = { type: "DRAW_ACCEPT" };
                    const result = applyAction(action);
                    setEngineState(result.state);
                    refreshLegalMoves(result.state);
                    send({
                      v: 1,
                      type: "GAME_ACTION",
                      roomId,
                      payload: { seat: 0, action },
                    });
                  }}
                  className="w-full rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                >
                  Claim Draw (3-fold)
                </button>
              )}
              <button
                onClick={handleDrawOffer}
                disabled={pendingDrawOffer}
                className="w-full rounded border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pendingDrawOffer ? "Draw offered..." : "Offer Draw"}
              </button>
              <button
                onClick={handleResign}
                className="w-full rounded border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Resign
              </button>
            </div>
          </div>
        )}

        {/* Move history */}
        {engineState.moveHistory.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">Moves</p>
            <div className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-xs">
              {Array.from({ length: Math.ceil(engineState.moveHistory.length / 2) }, (_, i) => {
                const white = engineState.moveHistory[i * 2];
                const black = engineState.moveHistory[i * 2 + 1];
                return (
                  <div key={i} className="flex gap-2">
                    <span className="w-6 text-gray-400">{i + 1}.</span>
                    <span className="w-16">{white?.san ?? ""}</span>
                    <span className="w-16 text-gray-500">{black?.san ?? ""}</span>
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

function isCheckState(state: EngineState, _side: string): boolean {
  try {
    const { isInCheck, toPosition } = require("@repo/chess");
    const pos = toPosition(state);
    return isInCheck(pos);
  } catch {
    return false;
  }
}
