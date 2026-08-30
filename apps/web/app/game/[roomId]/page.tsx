"use client";

import { useState, useEffect, useCallback, use } from "react";
import { ChessBoard } from "@/components/chess/board";
import { useWebSocket } from "@/lib/ws/hooks";
import { useTheme } from "@/lib/theme";
import { Button, Badge } from "@repo/ui";
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
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
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

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8 lg:flex-row lg:items-start lg:gap-10">
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
      <div className="w-full space-y-4 lg:w-64">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold text-foreground">Chess</h1>
            <Badge variant="default">{roomId}</Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${wsState === "open" ? "bg-success" : "bg-danger"}`} />
            <span className="capitalize">{wsState}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${engineState.turn === "white" ? "bg-surface-hover text-foreground" : "bg-foreground text-background"}`}>
            {engineState.turn === "white" ? "W" : "B"}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground capitalize">{engineState.turn} to move</p>
            <p className="text-xs text-muted">Move {engineState.fullmoveNumber}</p>
          </div>
        </div>

        {resultText && (
          <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
            {resultText}
          </div>
        )}

        {drawOfferFrom && (
          <div className="rounded-lg border border-accent/20 bg-accent/10 px-4 py-3">
            <p className="mb-3 text-xs font-medium text-accent">Opponent offers a draw</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleDrawRespond(true)}>Accept</Button>
              <Button size="sm" variant="secondary" onClick={() => handleDrawRespond(false)}>Decline</Button>
            </div>
          </div>
        )}

        {!isGameOver && (
          <div className="space-y-2">
            {canThreefold && (
              <Button
                variant="success"
                className="w-full"
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
              >
                Claim Draw (3-fold)
              </Button>
            )}
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleDrawOffer}
              disabled={pendingDrawOffer}
            >
              {pendingDrawOffer ? "Draw offered..." : "Offer Draw"}
            </Button>
            <Button
              variant="danger"
              className="w-full"
              onClick={handleResign}
            >
              Resign
            </Button>
          </div>
        )}

        {engineState.moveHistory.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Moves</p>
            <div className="max-h-52 space-y-0.5 overflow-y-auto font-mono text-xs">
              {Array.from({ length: Math.ceil(engineState.moveHistory.length / 2) }, (_, i) => {
                const white = engineState.moveHistory[i * 2];
                const black = engineState.moveHistory[i * 2 + 1];
                return (
                  <div key={i} className="flex gap-2">
                    <span className="w-6 text-muted">{i + 1}.</span>
                    <span className="w-16">{white?.san ?? ""}</span>
                    <span className="w-16 text-muted">{black?.san ?? ""}</span>
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
