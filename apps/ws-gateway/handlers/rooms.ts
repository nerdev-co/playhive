import { WebSocket } from "ws";

import {
    type GameType,
    type RoomSnapshot,
    type SeatInfo,
    type PlayerInfo,
    ErrorCode,
} from "protocol";
import { createEnvelope } from "protocol";

import {
    sendEnvelope,
    broadcastToRoom,
    clients,
    rooms,
    generateId,
    generateInviteCode,
    generateInviteCodeFromId,
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
    const roomId = generateId();
    const inviteCode = generateInviteCode();

    const room: RoomSnapshot = {
        id: roomId,
        name: `${payload.game} Room`,
        gameType: payload.game,
        maxPlayers: payload.maxPlayers,
        status: "WAITING",
        settings: payload.settings,
        hostId: playerId,
        seats: [
            {
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
                ready: false,
                score: 0,
            },
        ],
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
        createEnvelope("ROOM_CREATED", { roomId, inviteCode, room }),
    );
    console.log(`Room created: ${roomId} (${inviteCode}) by ${playerId}`);
}

export function handleJoinRoom(
    ws: WebSocket,
    playerId: string,
    payload: { inviteCode: string; media: { voice: boolean; video: boolean } },
): void {
    const room = [...rooms.values()].find((r) => {
        const code = generateInviteCodeFromId(r.id);
        return code === payload.inviteCode;
    });

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

    if (room.seats.length >= room.maxPlayers) {
        sendEnvelope(
            ws,
            createEnvelope("ERROR", {
                code: ErrorCode.ROOM_FULL,
                message: "Room is full",
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
                message: "No available seats",
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
        ...room.seats[seatIndex],
        playerId,
        player,
        bot: false,
        status: "ACTIVE",
        ready: false,
        seat: seatIndex,
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
            inviteCode: generateInviteCodeFromId(room.id),
            room,
        }),
    );

    broadcastToRoom(
        room.id,
        createEnvelope("PLAYER_JOINED", { seat: seatIndex, player }),
        playerId,
    );
    console.log(
        `Player ${playerId} joined room ${room.id} at seat ${seatIndex}`,
    );
}
