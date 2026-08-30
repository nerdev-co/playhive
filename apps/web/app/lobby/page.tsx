"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWebSocket } from "@/lib/ws/hooks";
import { getUser, guestLogin, isLoggedIn } from "@/lib/auth";
import { Button, Input, Badge, Card } from "@repo/ui";
import type { RoomSnapshot, PlayerInfo } from "@repo/protocol";

export default function LobbyPage() {
  const router = useRouter();
  const { state, send, on } = useWebSocket();
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
      })
      .catch(() => {
        setAuthReady(true);
      });
  }, []);

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

    const unsub3 = on("ROOM_CREATED", (payload) => {
      if (payload && typeof payload === "object" && "roomId" in payload) {
        const { roomId } = payload as { roomId: string };
        router.push(`/game/${roomId}`);
      }
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [on, router]);

  const createRoom = useCallback((game: string, maxPlayers: number, privateRoom: boolean) => {
    send({
      v: 1,
      type: "CREATE_ROOM",
      payload: { game, maxPlayers, private: privateRoom, settings: { media: { voice: false, video: false } } },
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Lobby</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${state === "open" ? "bg-success" : "bg-danger"}`} />
            {state}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Create Room</Button>
      </header>

      {player && (
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-hover text-sm font-semibold text-foreground">
            {player.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{player.displayName}</p>
            <p className="text-xs text-muted">@{player.username}</p>
          </div>
        </div>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Join by invite code</h2>
        <div className="flex gap-2">
          <Input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinByCode()}
            placeholder="Paste invite code"
            className="max-w-xs"
          />
          <Button variant="secondary" onClick={joinByCode}>
            Join
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-muted">Available Rooms</h2>
        {rooms.length === 0 ? (
          <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-sm text-muted">No rooms available.</p>
            <p className="text-xs text-muted/70">Create one to get started.</p>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rooms.map((room) => {
              const seatsTaken = room.seats.filter((s) => s.playerId).length;
              const isFull = seatsTaken >= room.maxPlayers;
              return (
                <Card
                  key={room.id}
                  hoverable
                  className="flex items-center justify-between p-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-medium text-foreground">{room.name}</h3>
                      <Badge variant="default">{room.gameType}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {seatsTaken} / {room.maxPlayers} players · {room.status}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => joinRoom(room.id)}
                    disabled={isFull}
                  >
                    {isFull ? "Full" : "Join"}
                  </Button>
                </Card>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-foreground">Create Room</h2>
        <div className="mb-4">
          <Input
            label="Game"
            value={game}
            onChange={(e) => setGame(e.target.value)}
          />
        </div>
        <div className="mb-6">
          <Input
            label="Max Players"
            type="number"
            min={1}
            max={8}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
          />
        </div>
        <div className="mb-6 flex items-center gap-2">
          <input
            id="private"
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-foreground"
          />
          <label htmlFor="private" className="text-sm text-foreground">Private room (invite only)</label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate(game, maxPlayers, isPrivate)}>Create</Button>
        </div>
      </div>
    </div>
  );
}
