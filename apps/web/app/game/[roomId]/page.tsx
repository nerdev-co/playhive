"use client";

import { useState, useEffect, useCallback, use, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChessBoard } from "@/components/chess/board";
import { LudoBoard } from "@/components/ludo/board";
import { useWebSocket } from "@/lib/ws/hooks";
import { useTheme } from "@/lib/theme";
import { useWebRTC } from "@/lib/ws/webrtc";
import { initGame, applyAction, legalActions, canClaimThreefold, isInCheck } from "@playhive/chess";
import { PIECE_SYMBOLS } from "@playhive/chess";
import type { EngineAction, EngineState } from "@playhive/chess";
import type { EngineState as LudoState, EngineAction as LudoAction } from "@playhive/ludo";
import type { GameType, SeatInfo } from "@playhive/protocol";

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
  const router = useRouter();
  const { state: wsState, send, on } = useWebSocket();
  const { setTheme } = useTheme();
  const resolvedParams = use(params);
  const roomId = resolvedParams.roomId;

  useEffect(() => { setTheme("game"); }, [setTheme]);

  const [gameType, setGameType] = useState<GameType | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("playhive:pendingGameType");
    return (stored as GameType) || null;
  });
  const [seatOrder, setSeatOrder] = useState<number[]>([]);
  const [gameResult, setGameResult] = useState<{ winner?: string; reason?: string } | null>(null);

  // Chess state
  const [chessState, setChessState] = useState<EngineState | null>(null);
  const [legalMoves, setLegalMoves] = useState<{ from: string; to: string; promotion?: string }[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [inCheck, setInCheck] = useState(false);
  const [pendingDrawOffer, setPendingDrawOffer] = useState(false);
  const [drawOfferFrom, setDrawOfferFrom] = useState<"white" | "black" | null>(null);
  const moveListRef = useRef<HTMLDivElement>(null);
  const seatRef = useRef<number>(0);

  // Ludo state
  const [ludoState, setLudoState] = useState<LudoState | null>(null);

  // Room info (for waiting room UI)
  const [roomSeats, setRoomSeats] = useState<SeatInfo[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<string>("WAITING");
  const [maxPlayers, setMaxPlayers] = useState(4);

  // WebRTC — find opponent from room seats
  const targetPlayerId = useMemo(() => {
    const seat = roomSeats.find((s) => s.seat !== seatRef.current && s.playerId);
    return seat?.playerId ?? null;
  }, [roomSeats]);
  const rtc = useWebRTC({
    roomId,
    targetPlayerId: targetPlayerId ?? "",
  });

  // Store roomId for RESUME on reconnect
  useEffect(() => {
    localStorage.setItem("playhive:activeRoomId", roomId);
    localStorage.removeItem("playhive:pendingGameType");
    return () => localStorage.removeItem("playhive:activeRoomId");
  }, [roomId]);

  const refreshChessLegalMoves = useCallback((state: EngineState) => {
    const actions = legalActions();
    const moves = actions
      .filter((a): a is Extract<EngineAction, { type: "MOVE" }> => a.type === "MOVE")
      .map((a) => ({ from: a.from, to: a.to, promotion: a.promotion }));
    setLegalMoves(moves);
  }, []);

  // Handle GAME_START — get gameType + initialState
  useEffect(() => {
    const unsub = on("GAME_START", (data: unknown) => {
      const msg = data as { payload?: { gameType?: GameType; seatOrder?: number[]; mySeat?: number; initialState?: Record<string, unknown> } };
      if (!msg?.payload) return;

      const type = msg.payload.gameType;
      if (type) setGameType(type);
      if (msg.payload.seatOrder) setSeatOrder(msg.payload.seatOrder);
      if (msg.payload.mySeat !== undefined) seatRef.current = msg.payload.mySeat;

      const initial = msg.payload.initialState;
      if (!initial) return;

      if (type === "chess") {
        const restored = initGame({ fen: initial.fen as string });
        if (initial.moveHistory) restored.moveHistory = initial.moveHistory as EngineState["moveHistory"];
        if (initial.gameOver !== undefined) restored.gameOver = initial.gameOver as boolean;
        if (initial.result) restored.result = initial.result as EngineState["result"];
        if (initial.resultReason) restored.resultReason = initial.resultReason as string;
        if (initial.turn) restored.turn = initial.turn as "white" | "black";
        if (initial.fullmoveNumber) restored.fullmoveNumber = initial.fullmoveNumber as number;
        if (initial.halfmoveClock) restored.halfmoveClock = initial.halfmoveClock as number;
        setChessState(restored);
        refreshChessLegalMoves(restored);
        setInCheck(isInCheck(restored));
      } else if (type === "ludo") {
        setLudoState(initial as unknown as LudoState);
      }
    });
    return unsub;
  }, [on, refreshChessLegalMoves]);

  // Handle ROOM_INFO — get gameType + room details before game starts
  useEffect(() => {
    const unsub = on("ROOM_INFO", (data: unknown) => {
      const msg = data as { payload?: { gameType?: GameType; hostId?: string; seats?: SeatInfo[]; maxPlayers?: number; status?: string } };
      if (!msg?.payload) return;
      if (msg.payload.gameType && !gameType) setGameType(msg.payload.gameType);
      if (msg.payload.hostId) setHostId(msg.payload.hostId);
      if (msg.payload.seats) setRoomSeats(msg.payload.seats);
      if (msg.payload.maxPlayers) setMaxPlayers(msg.payload.maxPlayers);
      if (msg.payload.status) setRoomStatus(msg.payload.status);
    });
    return unsub;
  }, [on, gameType]);

  // Handle ROOM_JOINED — server confirmed join, extract room details
  useEffect(() => {
    const unsub = on("ROOM_JOINED", (data: unknown) => {
      const msg = data as { payload?: { room?: { gameType?: GameType; hostId?: string; seats?: SeatInfo[]; maxPlayers?: number; status?: string } } };
      if (!msg?.payload?.room) return;
      const room = msg.payload.room;
      if (room.gameType && !gameType) setGameType(room.gameType);
      if (room.hostId) setHostId(room.hostId);
      if (room.seats) setRoomSeats(room.seats);
      if (room.maxPlayers) setMaxPlayers(room.maxPlayers);
      if (room.status) setRoomStatus(room.status);
    });
    return unsub;
  }, [on, gameType]);

  // Handle ERROR from server (room not found, not in room, etc.)
  const [serverError, setServerError] = useState<string | null>(null);
  useEffect(() => {
    const unsub = on("ERROR", (data: unknown) => {
      const msg = data as { payload?: { message?: string } };
      if (msg?.payload?.message) {
        setServerError(msg.payload.message);
      }
    });
    return unsub;
  }, [on]);

  // Listen for players joining/leaving during waiting room
  useEffect(() => {
    const unsubs = [
      on("PLAYER_JOINED", (data: unknown) => {
        const msg = data as { payload?: { seat?: number; player?: { id: string; username: string; displayName: string; isGuest: boolean } } };
        if (msg?.payload?.seat === undefined) return;
        setRoomSeats(prev => {
          const updated = [...prev];
          updated[msg.payload!.seat!] = {
            seat: msg.payload!.seat!,
            playerId: msg.payload!.player?.id ?? null,
            player: msg.payload!.player ?? null,
            bot: false,
            status: "ACTIVE",
            ready: true,
            score: 0,
          };
          return updated;
        });
      }),
      on("PLAYER_LEFT", (data: unknown) => {
        const msg = data as { payload?: { seat?: number } };
        if (msg?.payload?.seat === undefined) return;
        setRoomSeats(prev => {
          const updated = [...prev];
          const seatIdx = msg.payload!.seat!;
          updated[seatIdx] = {
            ...updated[seatIdx],
            playerId: null,
            player: null,
            ready: false,
            status: "LEFT",
            seat: seatIdx,
            bot: false,
            score: 0,
          };
          return updated;
        });
      }),
      on("ROOM_STATE_CHANGE", (data: unknown) => {
        const msg = data as { payload?: { to?: string } };
        if (msg?.payload?.to) setRoomStatus(msg.payload.to);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [on]);
  useEffect(() => {
    const unsub = on("GAME_STATE", (data: unknown) => {
      const msg = data as { payload?: { kind?: string; state?: Record<string, unknown> } };
      if (msg?.payload?.kind !== "snapshot" || !msg.payload.state) return;
      const s = msg.payload.state;

      if (gameType === "chess" && s.fen) {
        const restored = initGame({ fen: s.fen as string });
        if (s.moveHistory) restored.moveHistory = s.moveHistory as EngineState["moveHistory"];
        if (s.gameOver !== undefined) restored.gameOver = s.gameOver as boolean;
        if (s.result) restored.result = s.result as EngineState["result"];
        if (s.resultReason) restored.resultReason = s.resultReason as string;
        if (s.turn) restored.turn = s.turn as "white" | "black";
        if (s.fullmoveNumber) restored.fullmoveNumber = s.fullmoveNumber as number;
        if (s.halfmoveClock) restored.halfmoveClock = s.halfmoveClock as number;
        setChessState(restored);
        refreshChessLegalMoves(restored);
        setInCheck(isInCheck(restored));
      } else if (gameType === "ludo") {
        setLudoState(s as unknown as LudoState);
      }
    });
    return unsub;
  }, [on, gameType, refreshChessLegalMoves]);

  // Handle GAME_END — show result then redirect to lobby
  useEffect(() => {
    const unsub = on("GAME_END", (data: unknown) => {
      const msg = data as { payload?: { winner?: string; reason?: string; result?: { winner?: string; reason?: string } } };
      const result = msg?.payload?.result ?? msg?.payload;
      const winner = result?.winner;
      const reason = result?.reason ?? msg?.payload?.reason;
      setGameResult({ winner, reason });

      setTimeout(() => {
        router.push("/lobby");
      }, 3000);
    });
    return unsub;
  }, [on, router]);

  // Request state from server on mount and when WS connects
  useEffect(() => {
    if (wsState === "open") {
      // Send RESUME with this roomId to join/re-join the room
      send({ v: 1, type: "RESUME", payload: { roomId } });
      // Also request state in case RESUME doesn't cover it
      setTimeout(() => {
        send({ v: 1, type: "REQUEST_STATE", payload: {} });
      }, 300);
    }
  }, [wsState, send, roomId]);

  // Also request state on mount (in case WS is already open)
  useEffect(() => {
    send({ v: 1, type: "REQUEST_STATE", payload: {} });
  }, [send]);

  // Initialize chess with empty state — server will send snapshot
  useEffect(() => {
    if (gameType === "chess") {
      const init = initGame();
      setChessState(init);
      refreshChessLegalMoves(init);
    }
  }, [gameType, refreshChessLegalMoves]);

  useEffect(() => {
    moveListRef.current?.scrollTo({ top: moveListRef.current.scrollHeight, behavior: "smooth" });
  }, [chessState?.moveHistory.length]);

  // Start game handler (host only)
  const handleStartGame = useCallback(() => {
    send({ v: 1, type: "START_GAME", roomId, payload: {} });
  }, [send, roomId]);

  // Chess handlers
  const handleChessMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      if (!chessState || chessState.gameOver) return;
      const action: EngineAction = { type: "MOVE", from, to, promotion: promotion as "q" | "r" | "b" | "n" | undefined };

      const result = applyAction(action);
      setLastMove({ from, to });
      setInCheck(isInCheck(result.state));
      setChessState(result.state);
      refreshChessLegalMoves(result.state);
      setPendingDrawOffer(false);
      setDrawOfferFrom(null);

      send({ v: 1, type: "GAME_ACTION", roomId, payload: { seat: seatRef.current, action } });
    },
    [chessState, roomId, refreshChessLegalMoves, send],
  );

  const handleResign = useCallback(() => {
    if (!chessState || chessState.gameOver) return;
    const action: EngineAction = { type: "RESIGN" };
    const result = applyAction(action);
    setChessState(result.state);
    setLastMove(null);
    send({ v: 1, type: "GAME_ACTION", roomId, payload: { seat: seatRef.current, action } });
  }, [chessState, roomId, send]);

  const handleDrawOffer = useCallback(() => {
    if (!chessState || chessState.gameOver || pendingDrawOffer) return;
    const action: EngineAction = { type: "DRAW_OFFER" };
    const result = applyAction(action);
    setChessState(result.state);
    setPendingDrawOffer(true);
    refreshChessLegalMoves(result.state);
    send({ v: 1, type: "GAME_ACTION", roomId, payload: { seat: seatRef.current, action } });
  }, [chessState, pendingDrawOffer, roomId, refreshChessLegalMoves, send]);

  const handleDrawRespond = useCallback(
    (accept: boolean) => {
      if (!chessState) return;
      const action: EngineAction = { type: accept ? "DRAW_ACCEPT" : "DRAW_DECLINE" };
      const result = applyAction(action);
      setChessState(result.state);
      setDrawOfferFrom(null);
      setPendingDrawOffer(false);
      refreshChessLegalMoves(result.state);
      send({ v: 1, type: "GAME_ACTION", roomId, payload: { seat: seatRef.current, action } });
    },
    [chessState, roomId, refreshChessLegalMoves, send],
  );

  // Ludo handler
  const handleLudoAction = useCallback(
    (action: { type: string; token?: number; distance?: number }) => {
      if (!ludoState || ludoState.gameOver) return;
      const ludoAction: LudoAction = {
        type: action.type as LudoAction["type"],
        token: action.token,
        distance: action.distance,
      };
      send({ v: 1, type: "GAME_ACTION", roomId, payload: { seat: seatRef.current, action: ludoAction } });
    },
    [ludoState, roomId, send],
  );

  const chessCaptured = useMemo(
    () => (chessState ? getCaptured(chessState.fen) : { byWhite: [], byBlack: [], diff: 0 }),
    [chessState],
  );

  // Server error — room not found, not in room, etc.
  if (serverError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
            <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-white">Could not join game</p>
            <p className="mt-1 text-xs text-neutral-500">{serverError}</p>
          </div>
          <button
            onClick={() => window.location.href = "/lobby"}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // Loading state — waiting for gameType or game state
  if (!gameType) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="text-center">
          <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
          <p className="text-xs text-neutral-500">Connecting to game...</p>
        </div>
      </div>
    );
  }

  // Waiting room — game type known but game hasn't started yet
  const isInWaitingRoom = gameType && roomStatus !== "IN_PROGRESS" && !chessState && !ludoState;
  if (isInWaitingRoom) {
    // Still loading room info from server
    if (roomSeats.length === 0) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-neutral-950">
          <div className="text-center">
            <div className="mx-auto mb-3 h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
            <p className="text-xs text-neutral-500">Joining room...</p>
          </div>
        </div>
      );
    }

    const myPlayerId = typeof window !== "undefined" ? localStorage.getItem("playhive:playerId") : null;
    const isHost = hostId !== null && myPlayerId !== null && hostId === myPlayerId;
    const occupiedSeats = roomSeats.filter(s => s.playerId !== null);
    const mySeatIdx = roomSeats.findIndex(s => s.playerId === myPlayerId);

    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <div className="w-full max-w-sm space-y-6 px-6">
          <div className="text-center">
            <h1 className="text-lg font-semibold text-white capitalize">{gameType} Room</h1>
            <p className="mt-1 text-xs text-neutral-500">Waiting for players to join...</p>
          </div>

          {/* Player list */}
          <div className="space-y-2">
            {roomSeats.map((seat, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                  seat.playerId
                    ? "border-neutral-700 bg-neutral-900/60"
                    : "border-neutral-800 bg-neutral-900/30 border-dashed"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    seat.playerId ? "bg-indigo-500/20 text-indigo-400" : "bg-neutral-800 text-neutral-600"
                  }`}>
                    {seat.playerId ? (seat.player?.displayName ?? "?") : idx + 1}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${seat.playerId ? "text-white" : "text-neutral-600"}`}>
                      {seat.player?.displayName ?? `Seat ${idx + 1}`}
                    </p>
                    {seat.playerId === hostId && (
                      <span className="text-[10px] font-medium text-amber-400">Host</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {seat.playerId && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  )}
                  {idx === mySeatIdx && (
                    <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] font-medium text-neutral-400">
                      You
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Start game button (host only) */}
          {isHost && (
            <button
              onClick={handleStartGame}
              disabled={occupiedSeats.length < 2}
              className="w-full rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-indigo-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start Game ({occupiedSeats.length}/{maxPlayers} players)
            </button>
          )}

          {!isHost && (
            <p className="text-center text-xs text-neutral-500">
              Waiting for host to start the game...
            </p>
          )}
        </div>
      </div>
    );
  }

  // Chess game over
  const isChessGameOver = gameType === "chess" && chessState?.gameOver;
  const canThreefold = gameType === "chess" && !isChessGameOver && canClaimThreefold();
  const resultText = isChessGameOver && chessState
    ? chessState.result === "draw"
      ? `Draw — ${chessState.resultReason}`
      : `${chessState.result === "white" ? "White" : "Black"} wins — ${chessState.resultReason}`
    : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-8 lg:flex-row lg:items-start lg:gap-8">
      {/* Board */}
      <div className="flex-1">
        {gameType === "chess" && chessState && (
          <>
            <CapturedRow pieces={chessCaptured.byBlack} lead={chessCaptured.diff < 0 ? -chessCaptured.diff : undefined} />
            <div className="my-1">
              <ChessBoard
                fen={chessState.fen}
                turn={chessState.turn}
                legalMoves={legalMoves}
                lastMove={lastMove}
                inCheck={inCheck}
                onMove={handleChessMove}
                disabled={isChessGameOver}
              />
            </div>
            <CapturedRow pieces={chessCaptured.byWhite} lead={chessCaptured.diff > 0 ? chessCaptured.diff : undefined} />
          </>
        )}

        {gameType === "ludo" && ludoState && (
          <LudoBoard
            state={ludoState}
            onAction={handleLudoAction}
            disabled={ludoState.gameOver}
            mySeat={seatOrder[0]}
          />
        )}
      </div>

      {/* Sidebar */}
      <div className="w-full space-y-4 lg:w-56">
        {/* Header */}
        <div className="animate-fade-in">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold text-white capitalize">{gameType}</h1>
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono text-neutral-500">
              {roomId.slice(0, 8)}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500">
            <span className={`h-1 w-1 rounded-full ${wsState === "open" ? "bg-emerald-500" : "bg-red-500"}`} />
            {wsState}
          </div>
        </div>

        {/* Chess turn + result + actions */}
        {gameType === "chess" && chessState && (
          <>
            {/* Turn */}
            <div className="animate-fade-in delay-1 flex items-center gap-2.5 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
              <div className={`flex h-7 w-7 items-center justify-center rounded-md border text-[11px] font-bold ${chessState.turn === "white" ? "border-neutral-300 bg-white text-neutral-900" : "border-neutral-600 bg-neutral-800 text-white"}`}>
                {chessState.turn === "white" ? "W" : "B"}
              </div>
              <div>
                <p className="text-xs font-medium text-white capitalize">{chessState.turn} to move</p>
                <p className="text-[10px] text-neutral-500">Move {chessState.fullmoveNumber}</p>
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
            {!isChessGameOver && (
              <div className="animate-fade-in delay-2 space-y-1.5">
                {canThreefold && (
                  <button
                    onClick={() => {
                      const action: EngineAction = { type: "DRAW_ACCEPT" };
                      const result = applyAction(action);
                      setChessState(result.state);
                      refreshChessLegalMoves(result.state);
                      send({ v: 1, type: "GAME_ACTION", roomId, payload: { seat: seatRef.current, action } });
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
            {chessState.moveHistory.length > 0 && (
              <div className="animate-fade-in delay-3">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-neutral-600">
                  Moves
                </p>
                <div ref={moveListRef} className="max-h-48 space-y-px overflow-y-auto font-mono text-[11px]">
                  {Array.from({ length: Math.ceil(chessState.moveHistory.length / 2) }, (_, i) => {
                    const white = chessState.moveHistory[i * 2];
                    const black = chessState.moveHistory[i * 2 + 1];
                    const isLast = i === Math.ceil(chessState.moveHistory.length / 2) - 1;
                    return (
                      <div key={i} className={`flex gap-2 rounded px-1 py-0.5 ${isLast ? "bg-neutral-800/60" : ""}`}>
                        <span className="w-5 text-neutral-600">{i + 1}.</span>
                        <span className="w-14 text-neutral-300">{white?.san ?? ""}</span>
                        <span className="w-14 text-neutral-500">{black?.san ?? ""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Ludo info */}
        {gameType === "ludo" && ludoState && (
          <div className="animate-fade-in delay-1 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="text-xs font-medium text-neutral-400">
              {ludoState.players.length} players active
            </p>
            {ludoState.playersWithEnds.length > 0 && (
              <p className="mt-1 text-[10px] text-neutral-500">
                Finished: {ludoState.playersWithEnds.join(", ")}
              </p>
            )}
          </div>
        )}

        {/* Media controls */}
        {targetPlayerId && (
          <div className="animate-fade-in delay-4 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-neutral-600">
              Media
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (rtc.mediaState.audio) {
                    rtc.toggleAudio();
                  } else {
                    rtc.startMedia({ audio: true });
                  }
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs transition-all duration-150 active:scale-[0.95] ${
                  rtc.mediaState.audio
                    ? "border-emerald-800/30 bg-emerald-500/10 text-emerald-400"
                    : "border-neutral-800 bg-neutral-800/50 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
                }`}
                title={rtc.mediaState.audio ? "Mute" : "Unmute"}
              >
                {rtc.mediaState.audio ? "🎤" : "🔇"}
              </button>
              <button
                onClick={() => {
                  if (rtc.mediaState.video) {
                    rtc.toggleVideo();
                  } else {
                    rtc.startMedia({ video: true });
                  }
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs transition-all duration-150 active:scale-[0.95] ${
                  rtc.mediaState.video
                    ? "border-emerald-800/30 bg-emerald-500/10 text-emerald-400"
                    : "border-neutral-800 bg-neutral-800/50 text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
                }`}
                title={rtc.mediaState.video ? "Stop Video" : "Start Video"}
              >
                {rtc.mediaState.video ? "📹" : "📷"}
              </button>
              <button
                onClick={rtc.stopAll}
                disabled={!rtc.mediaState.audio && !rtc.mediaState.video}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-900/30 bg-red-500/10 text-xs text-red-400 transition-all duration-150 hover:bg-red-500/20 active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-30"
                title="Stop All"
              >
                ✕
              </button>
            </div>
            {rtc.connected && (
              <p className="mt-1.5 text-[10px] text-emerald-500">Connected</p>
            )}
          </div>
        )}
      </div>

      {gameResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="animate-fade-in rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center">
            <p className="mb-2 text-sm font-medium uppercase tracking-widest text-neutral-500">
              Game Over
            </p>
            <p className="text-2xl font-bold text-white">
              {gameResult.winner ? `${gameResult.winner} wins` : "Draw"}
            </p>
            {gameResult.reason && (
              <p className="mt-2 text-sm text-neutral-400">{gameResult.reason}</p>
            )}
            <p className="mt-4 text-xs text-neutral-600">Redirecting to lobby...</p>
          </div>
        </div>
      )}
    </div>
  );
}
