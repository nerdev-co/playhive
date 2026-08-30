"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/lib/ws/hooks";
import { getUser, guestLogin, isLoggedIn, getToken } from "@/lib/auth";
import type { RoomSnapshot, PlayerInfo } from "@repo/protocol";

export default function LobbyPage() {
  const router = useRouter();
  const { state, send, on, authenticate } = useWebSocket();
  const [rooms, setRooms] = useState<RoomSnapshot[]>([]);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      setPlayer(getUser() as PlayerInfo);
      setAuthReady(true);
      return;
    }
    guestLogin()
      .then((res) => {
        setPlayer(res.user as PlayerInfo);
        setAuthReady(true);
        const token = getToken();
        if (token) authenticate(token);
      })
      .catch(() => setAuthReady(true));
  }, [authenticate]);

  useEffect(() => {
    const unsub1 = on("ROOM_UPDATE", (envelope) => {
      const payload = (envelope as { payload: { room: RoomSnapshot } }).payload;
      if (payload?.room) {
        setRooms((prev) => {
          const idx = prev.findIndex((r) => r.id === payload.room.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = payload.room;
            return next;
          }
          return [...prev, payload.room];
        });
      }
    });

    const unsub2 = on("ROOM_CREATED", (envelope) => {
      const payload = (envelope as { payload: { roomId: string } }).payload;
      if (payload?.roomId) router.push(`/game/${payload.roomId}`);
    });

    return () => { unsub1(); unsub2(); };
  }, [on, router]);

  const createRoom = useCallback((game: string, maxPlayers: number, isPrivate: boolean) => {
    send({
      v: 1,
      type: "CREATE_ROOM",
      payload: { game, maxPlayers, private: isPrivate, settings: { media: { voice: false, video: false } } },
    });
    setShowCreate(false);
  }, [send]);

  const joinRoom = useCallback((roomId: string) => {
    send({
      v: 1,
      type: "JOIN_ROOM",
      payload: { roomId, media: { voice: false, video: false } },
    });
    router.push(`/game/${roomId}`);
  }, [send, router]);

  const joinByCode = useCallback(() => {
    if (!inviteCode.trim()) return;
    send({
      v: 1,
      type: "JOIN_ROOM",
      payload: { inviteCode: inviteCode.trim(), media: { voice: false, video: false } },
    });
    setInviteCode("");
  }, [inviteCode, send]);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {/* Header */}
      <header className="animate-fade-in mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Lobby</h1>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
            <span className={`h-1 w-1 rounded-full ${state === "open" ? "bg-emerald-500" : "bg-red-500"}`} />
            {state}
          </div>
        </div>
        <button
          onClick={() => {
            if (player?.isGuest) {
              alert("Guests cannot create rooms. Sign up to create a room.");
              return;
            }
            setShowCreate(true);
          }}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-xs font-medium text-white transition-all duration-150 hover:bg-indigo-400 active:scale-[0.98]"
        >
          Create Room
        </button>
      </header>

      {/* Player */}
      {player && (
        <div className="animate-fade-in delay-1 mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-xs font-medium text-neutral-300">
            {player.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-sm font-medium text-white">{player.displayName}</p>
            <p className="text-[11px] text-neutral-500">@{player.username}</p>
          </div>
        </div>
      )}

      {/* Invite code */}
      <section className="animate-fade-in delay-2 mb-8">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-widest text-neutral-500">
          Join by invite code
        </h2>
        <div className="flex gap-2">
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinByCode()}
            placeholder="Paste code"
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-neutral-700"
          />
          <button
            onClick={joinByCode}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-medium text-neutral-300 transition-all duration-150 hover:border-neutral-600 hover:text-white active:scale-[0.98]"
          >
            Join
          </button>
        </div>
      </section>

      {/* Rooms */}
      <section className="animate-fade-in delay-3">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-widest text-neutral-500">
          Available Rooms
        </h2>
        {rooms.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-800 py-14 text-center">
            <p className="text-sm text-neutral-500">No rooms yet.</p>
            <p className="mt-1 text-xs text-neutral-600">Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map((room, i) => {
              const seatsTaken = room.seats.filter((s) => s.playerId).length;
              const isFull = seatsTaken >= room.maxPlayers;
              const gameColor = room.gameType === "chess" ? "text-amber-400" : "text-emerald-400";
              return (
                <div
                  key={room.id}
                  className={`animate-fade-in-up delay-${Math.min(i, 5)} flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 transition-colors hover:border-neutral-700 hover:bg-neutral-900`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{room.name}</span>
                      <span className={`text-[10px] font-medium uppercase ${gameColor}`}>
                        {room.gameType}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      {seatsTaken}/{room.maxPlayers} players
                    </p>
                  </div>
                  <button
                    onClick={() => joinRoom(room.id)}
                    disabled={isFull}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-[11px] font-medium text-neutral-300 transition-all duration-150 hover:border-neutral-600 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {isFull ? "Full" : "Join"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Create dialog */}
      {showCreate && (
        <CreateRoomDialog
          onClose={() => setShowCreate(false)}
          onCreate={createRoom}
        />
      )}
    </div>
  );
}

function CreateRoomDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (game: string, maxPlayers: number, isPrivate: boolean) => void;
}) {
  const [game, setGame] = useState("chess");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [isPrivate, setIsPrivate] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="animate-scale-in w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl">
        <h2 className="mb-4 text-sm font-semibold text-white">Create Room</h2>

        <div className="mb-3">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-neutral-500">
            Game
          </label>
          <select
            value={game}
            onChange={(e) => setGame(e.target.value)}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-800/50 px-3 py-2 text-sm text-white outline-none focus:border-neutral-700"
          >
            <option value="chess">Chess</option>
            <option value="ludo">Ludo</option>
          </select>
        </div>

        <div className="mb-3">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-widest text-neutral-500">
            Max Players
          </label>
          <input
            type="number"
            min={2}
            max={8}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            className="w-full rounded-lg border border-neutral-800 bg-neutral-800/50 px-3 py-2 text-sm text-white outline-none focus:border-neutral-700"
          />
        </div>

        <div className="mb-5 flex items-center gap-2">
          <input
            id="private"
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-neutral-700 bg-neutral-800 accent-indigo-500"
          />
          <label htmlFor="private" className="text-xs text-neutral-400">Private (invite only)</label>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-400 transition-colors hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(game, maxPlayers, isPrivate)}
            className="rounded-lg bg-indigo-500 px-4 py-1.5 text-xs font-medium text-white transition-all duration-150 hover:bg-indigo-400 active:scale-[0.98]"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
