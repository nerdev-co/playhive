import { WebSocket } from "ws";

import { type RoomSnapshot, type SeatInfo, ErrorCode } from "protocol";
import { createEnvelope } from "protocol";

import { sendEnvelope, broadcastToRoom, clients, rooms } from "../utils";

export function handlePlayerReady(playerId: string, ready: boolean): void {
    const client = clients.get(playerId);
    if (!client || !client.roomId || client.seat === undefined) return;

    const room = rooms.get(client.roomId);
    if (!room) return;

    const seat = room.seats[client.seat];
    if (!seat || seat.playerId !== playerId) return;

    seat.ready = ready;
    rooms.set(client.roomId, room);

    broadcastToRoom(
        client.roomId,
        createEnvelope(ready ? "PLAYER_READY" : "PLAYER_UNREADY", {
            seat: client.seat,
        }),
    );
}

export function handleStartGame(ws: WebSocket, playerId: string): void {
    const client = clients.get(playerId);
    if (!client || !client.roomId) return;

    const room = rooms.get(client.roomId);
    if (!room) return;

    if (room.hostId !== playerId) {
        sendEnvelope(
            ws,
            createEnvelope("ERROR", {
                code: ErrorCode.NOT_HOST,
                message: "Only host can start game",
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

    const allReady = room.seats
        .filter((s: SeatInfo) => s.playerId)
        .every((s: SeatInfo) => s.ready);
    if (!allReady) {
        sendEnvelope(
            ws,
            createEnvelope("ERROR", {
                code: ErrorCode.INVALID_ACTION,
                message: "Not all players ready",
            }),
        );
        return;
    }

    room.status = "STARTING";
    rooms.set(room.id, room);

    broadcastToRoom(
        room.id,
        createEnvelope("ROOM_STATE_CHANGE", {
            from: "WAITING",
            to: "STARTING",
        }),
    );

    setTimeout(() => {
        const updatedRoom = rooms.get(room.id);
        if (!updatedRoom) return;

        updatedRoom.status = "IN_PROGRESS";
        updatedRoom.startedAt = new Date().toISOString();
        rooms.set(updatedRoom.id, updatedRoom);

        const seatOrder = updatedRoom.seats
            .filter((s: SeatInfo) => s.playerId)
            .map((s: SeatInfo) => s.seat);

        broadcastToRoom(
            updatedRoom.id,
            createEnvelope("GAME_START", {
                seatOrder,
                config: {
                    maxPlayers: updatedRoom.maxPlayers,
                    media: updatedRoom.settings.media,
                    private: updatedRoom.settings.private,
                },
                initialState: {},
            }),
        );

        broadcastToRoom(
            updatedRoom.id,
            createEnvelope("ROOM_STATE_CHANGE", {
                from: "STARTING",
                to: "IN_PROGRESS",
            }),
        );
    }, 1000);
}

export function handleLeaveRoom(playerId: string): void {
    const client = clients.get(playerId);
    if (!client || !client.roomId || client.seat === undefined) return;

    const room = rooms.get(client.roomId);
    if (!room) return;

    const seat = room.seats[client.seat];
    if (!seat || seat.playerId !== playerId) return;

    seat.playerId = null;
    seat.player = undefined;
    seat.status = "LEFT";
    seat.ready = false;

    if (room.hostId === playerId) {
        const nextHost = room.seats.find(
            (s: SeatInfo) => s.playerId && s.status === "ACTIVE",
        );
        if (nextHost) {
            room.hostId = nextHost.playerId!;
        }
    }

    if (room.seats.every((s: SeatInfo) => s.playerId === null)) {
        rooms.delete(room.id);
        console.log(`Room ${room.id} deleted (empty)`);
    } else {
        rooms.set(room.id, room);
        broadcastToRoom(
            room.id,
            createEnvelope("PLAYER_LEFT", {
                seat: client.seat,
                reason: "left",
            }),
        );
    }

    client.roomId = undefined;
    client.seat = undefined;
}
