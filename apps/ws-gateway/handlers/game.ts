import { WebSocket } from "ws";

import { type RoomSnapshot, type SeatInfo, ErrorCode } from "protocol";
import { createEnvelope } from "protocol";

import {
    sendEnvelope,
    broadcastToRoom,
    clients,
    rooms,
    gameStates,
    generateId,
} from "../utils";

export function handleGameAction(
    playerId: string,
    payload: { seat: number; action: { type: string; [key: string]: unknown }; state?: Record<string, unknown> },
): void {
    const client = clients.get(playerId);
    if (!client || !client.roomId || client.seat === undefined) return;

    if (client.seat !== payload.seat) {
        sendEnvelope(
            client.ws,
            createEnvelope("ERROR", {
                code: ErrorCode.NOT_YOUR_TURN,
                message: "Not your turn",
            }),
        );
        return;
    }

    const room = rooms.get(client.roomId);
    if (!room || room.status !== "IN_PROGRESS") return;

    console.log(`Game action from ${playerId}:`, payload.action);

    // Store the updated game state if client sent it
    if (payload.state) {
        const existing = gameStates.get(room.id);
        gameStates.set(room.id, {
            gameType: room.gameType,
            state: payload.state,
            stateVersion: Date.now(),
        });
    }

    broadcastToRoom(
        room.id,
        createEnvelope("GAME_STATE", {
            kind: "delta",
            stateVersion: Date.now(),
            state: { lastAction: payload.action },
        }),
        playerId,
    );

    sendEnvelope(
        client.ws,
        createEnvelope("ACK", {
            requestId: generateId(),
            stateVersion: Date.now(),
        }),
    );
}

export function handlePing(ws: WebSocket): void {
    sendEnvelope(ws, createEnvelope("PONG", {}));
}
