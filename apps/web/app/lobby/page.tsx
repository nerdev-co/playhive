"use client";

import { useState, useEffect } from "react";
import { useWebSocket } from "@/lib/ws/hooks";
import type { RoomSnapshot, PlayerInfo } from "@repo/protocol";

export default function LobbyPage() {
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

  const joinRoom = () => {
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
          <p className="text-gray-500 text-sm">Connection: {state}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          Create Room
        </button>
      </header>

      {player && (
        <div className="mb-6 flex items-center gap-4 rounded border p-4">
          <div className="h-10 w-10 rounded-full bg-gray-200" />
          <div>
            <p className="font-medium">{player.displayName}</p>
            <p className="text-xs text-gray-500">@{player.username}</p>
          </div>
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Join by invite code</h2>
        <div className="flex gap-2">
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Enter invite code"
            className="flex-1 rounded border px-3 py-2"
          />
          <button onClick={joinRoom} className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800">
            Join
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Available Rooms</h2>
        {rooms.length === 0 ? (
          <p className="text-gray-500">No rooms available. Create one to get started.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rooms.map((room) => (
              <div key={room.id} className="rounded border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{room.name}</h3>
                  <span className="rounded bg-gray-100 px-2 py-1 text-xs">{room.gameType}</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  {room.seats.filter((s) => s.playerId).length} / {room.maxPlayers} players
                </p>
                <p className="text-xs text-gray-400">Status: {room.status}</p>
              </div>
            ))}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold">Create Room</h2>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">Game</label>
          <select
            value={game}
            onChange={(e) => setGame(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            <option value="chess">Chess</option>
            <option value="ludo">Ludo</option>
            <option value="tic-tac-toe">Tic Tac Toe</option>
          </select>
        </div>
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">Max Players</label>
          <input
            type="number"
            min={1}
            max={8}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            className="w-full rounded border px-3 py-2"
          />
        </div>
        <div className="mb-6 flex items-center gap-2">
          <input
            id="private"
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          <label htmlFor="private" className="text-sm">Private room</label>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-4 py-2 hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => onCreate(game, maxPlayers, isPrivate)}
            className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
