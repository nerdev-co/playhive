"use client";

import { useState, useEffect, useCallback } from "react";
import { ChessBoard } from "@/components/chess/board";
import { useWebSocket } from "@/lib/ws/hooks";
import { initGame, applyAction, legalActions } from "@repo/chess";
import type { EngineAction, EngineState } from "@repo/chess";

export default function GamePage({ params }: { params: { roomId: string } }) {
  const { state: wsState, send, on } = useWebSocket();
  const [engineState, setEngineState] = useState<EngineState | null>(null);
  const [legalMoves, setLegalMoves] = useState<{ from: string; to: string; promotion?: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [winner, setWinner] = useState<string | null>(null);

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
    (from: string, to: string) => {
      if (!engineState) return;
      const promotion = engineState.turn === "white" && to[1] === "8" ? "q" : undefined;
      const action: EngineAction = { type: "MOVE", from, to, promotion };
      const result = applyAction(action);
      if (result.gameOver) {
        setWinner(result.result?.winner ?? null);
      }
      setEngineState(result.state);
      refreshLegalMoves(result.state);

      send({
        v: 1,
        type: "GAME_ACTION",
        roomId: params.roomId,
        payload: { seat: 0, action },
      });
    },
    [engineState, params.roomId, refreshLegalMoves, send],
  );

  if (!engineState) {
    return <div className="p-6">Loading game...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Chess</h1>
          <p className="text-sm text-gray-500">Room: {params.roomId}</p>
          <p className="text-sm text-gray-500">Turn: {engineState.turn}</p>
        </div>
        <div className="text-right">
          <p className="text-sm">Connection: {wsState}</p>
        </div>
      </header>

      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}

      {winner && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-green-700">
          Game over! Winner: {winner}
        </div>
      )}

      <ChessBoard
        fen={engineState.fen}
        turn={engineState.turn}
        legalMoves={legalMoves}
        onMove={handleMove}
      />
    </div>
  );
}
