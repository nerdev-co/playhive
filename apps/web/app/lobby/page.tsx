"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/lib/ws/hooks";
import type { RoomSnapshot, PlayerInfo } from "@repo/protocol";

export default function LobbyPage() {
  const router = useRouter();
  const { state, send, on } = useWebSocket();
  const [rooms, setRooms] = useState<RoomSnapshot[]>([]);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    const unsub1 = on("ROOM_UPDATE", (payload) => {
      if (payload && typeof payload === "object" && "room" in payload) {
        const room = (payload as { room: RoomSnapshot }).room;
        setRooms((prev) => {
          const idx = prev.findIndex((r) => r.id === room.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = room;
            return next;
          }
          return [...prev, room];
        });
      }
    });

    const unsub2 = on("PLAYER_JOINED", (payload) => {
      if (payload && typeof payload === "object" && "player" in payload) {
        setPlayer((payload as { player: PlayerInfo }).player);
      }
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [on]);

  const createRoom = (game: string, maxPlayers: number, privateRoom: boolean) => {
    send({
      v: 1,
      type: "CREATE_ROOM",
      payload: { game, maxPlayers, private: privateRoom, settings: { media: { voice: false, video: false } } },
    });
    setShowCreate(false);
  };

  const joinRoom = (roomId: string) => {
    send({
      v: 1,
      type: "JOIN_ROOM",
      payload: { roomId, media: { voice: false, video: false } },
    });
    router.push(`/game/${roomId}`);
  };

  const joinByCode = () => {
    if (!inviteCode.trim()) return;
    send({
      v: 1,
      type: "JOIN_ROOM",
      payload: { inviteCode: inviteCode.trim(), media: { voice: false, video: false } },
    });
    setInviteCode("");
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lobby</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            <span className={`inline-block h-2 w-2 rounded-full ${state === "open" ? "bg-green-500" : "bg-red-500"}`} />
            {state}
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800"
        >
          Create Room
        </button>
      </header>

      {player && (
        <div className="mb-6 flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">
            {player.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="font-medium">{player.displayName}</p>
            <p className="text-xs text-gray-400">@{player.username}</p>
          </div>
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">Join by invite code</h2>
        <div className="flex gap-2">
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinByCode()}
            placeholder="Enter invite code"
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm shadow-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
          <button
            onClick={joinByCode}
            className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium shadow-sm transition hover:bg-gray-50"
          >
            Join
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">Available Rooms</h2>
        {rooms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
            <p className="text-gray-400">No rooms available.</p>
            <p className="mt-1 text-sm text-gray-300">Create one to get started.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rooms.map((room) => {
              const seatsTaken = room.seats.filter((s) => s.playerId).length;
              const isFull = seatsTaken >= room.maxPlayers;
              return (
                <div key={room.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{room.name}</h3>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-gray-500">
                        {room.gameType}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {seatsTaken} / {room.maxPlayers} players · {room.status}
                    </p>
                  </div>
                  <button
                    onClick={() => joinRoom(room.id)}
                    disabled={isFull}
                    className="rounded-lg bg-black px-4 py-1.5 text-xs font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {isFull ? "Full" : "Join"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

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
  onCreate: (game: string, maxPlayers: number, privateRoom: boolean) => void;
}) {
  const [game, setGame] = useState("chess");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [isPrivate, setIsPrivate] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <h2 className="mb-5 text-lg font-semibold">Create Room</h2>
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Game</label>
          <select
            value={game}
            onChange={(e) => setGame(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
          >
            <option value="chess">Chess</option>
            <option value="ludo">Ludo</option>
          </select>
        </div>
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Max Players</label>
          <input
            type="number"
            min={2}
            max={8}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
          />
        </div>
        <div className="mb-6 flex items-center gap-2">
          <input
            id="private"
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="private" className="text-sm text-gray-600">Private room (invite only)</label>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onCreate(game, maxPlayers, isPrivate)}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
