import { WebSocket } from "ws";

import {
    type GameType,
    type RoomSnapshot,
    type SeatInfo,
    type PlayerInfo,
    ErrorCode,
} from "@playhive/protocol";

import { createEnvelope } from "@playhive/protocol";
import {
    sendEnvelope,
    broadcastToRoom,
    clients,
    rooms,
    generateShortId,
} from "../utils";

export function handleCreateRoom(
    ws: WebSocket,
    playerId: string,
    payload: {
        game: GameType;
        maxPlayers: number;
        private: boolean;
        settings: {
            media: { voice: boolean; video: boolean };
            maxPlayers: number;
            private: boolean;
        };
    },
): void {
    const roomId = generateShortId();

    const room: RoomSnapshot = {
        id: roomId,
        name: `${payload.game} Room`,
        gameType: payload.game,
        maxPlayers: payload.maxPlayers,
        status: "WAITING",
        settings: payload.settings,
        hostId: playerId,
        seats: Array.from({ length: payload.maxPlayers }, (_, i) =>
            i === 0
                ? {
                      seat: 0,
                      playerId,
                      player: {
                          id: playerId,
                          username: `player_${playerId.slice(0, 8)}`,
                          displayName: `Player ${playerId.slice(0, 8)}`,
                          isGuest: true,
                      },
                      bot: false,
                      status: "ACTIVE",
                      ready: true,
                      score: 0,
                  }
                : {
                      seat: i,
                      playerId: null,
                      player: null,
                      bot: false,
                      status: "ACTIVE",
                      ready: false,
                      score: 0,
                  },
        ),
        createdAt: new Date().toISOString(),
    };

    rooms.set(roomId, room);

    const client = clients.get(playerId);
    if (client) {
        client.roomId = roomId;
        client.seat = 0;
    }

    sendEnvelope(
        ws,
        createEnvelope("ROOM_CREATED", {
            roomId: room.id,
            room,
        }),
    );

    for (const [, c] of clients) {
        if (c.ws !== ws && c.ws.readyState === 1) {
            sendEnvelope(c.ws, createEnvelope("ROOM_UPDATE", { room }));
        }
    }

    console.log(`Room created: ${roomId} by ${playerId}`);
}

export function handleJoinRoom(
    ws: WebSocket,
    playerId: string,
    payload: { roomId: string; media: { voice: boolean; video: boolean } },
): void {
    const room = rooms.get(payload.roomId);

    if (!room) {
        sendEnvelope(
            ws,
            createEnvelope("ERROR", {
                code: ErrorCode.ROOM_NOT_FOUND,
                message: "Room not found",
            }),
        );
        return;
    }

    if (room.status !== "WAITING") {
        sendEnvelope(
            ws,
            createEnvelope("ERROR", {
                code: ErrorCode.GAME_ALREADY_STARTED,
                message: "Game already started",
            }),
        );
        return;
    }

    const seatIndex = room.seats.findIndex(
        (s: SeatInfo) => s.playerId === null,
    );
    if (seatIndex === -1) {
        sendEnvelope(
            ws,
            createEnvelope("ERROR", {
                code: ErrorCode.ROOM_FULL,
                message: "Room is full",
            }),
        );
        return;
    }

    const player: PlayerInfo = {
        id: playerId,
        username: `player_${playerId.slice(0, 8)}`,
        displayName: `Player ${playerId.slice(0, 8)}`,
        isGuest: true,
    };

    room.seats[seatIndex] = {
        seat: seatIndex,
        playerId,
        player,
        bot: false,
        status: "ACTIVE",
        ready: true,
        score: 0,
    };

    const client = clients.get(playerId);
    if (client) {
        client.roomId = room.id;
        client.seat = seatIndex;
    }

    rooms.set(room.id, room);

    sendEnvelope(
        ws,
        createEnvelope("ROOM_CREATED", {
            roomId: room.id,
            room,
        }),
    );

    broadcastToRoom(
        room.id,
        createEnvelope("PLAYER_JOINED", { seat: seatIndex, player }),
        playerId,
    );

    for (const [, c] of clients) {
        if (c.ws.readyState === 1) {
            sendEnvelope(c.ws, createEnvelope("ROOM_UPDATE", { room }));
        }
    }

    console.log(
        `Player ${playerId} joined room ${room.id} at seat ${seatIndex}`,
    );
}
