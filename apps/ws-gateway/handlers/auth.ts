import { WebSocket } from "ws";

import { createEnvelope } from "@playhive/protocol";
import { sendEnvelope, clients, rooms, generateId } from "../utils";

export function handleAuth(ws: WebSocket, payload: { token: string }): void {
    const playerId = generateId();
    const token = `session-${generateId()}`;

    // Check if this WebSocket already has an authenticated client (e.g. from a previous AUTH)
    // Transfer their room/seat assignment to the new client
    let existingRoomId: string | undefined;
    let existingSeat: number | undefined;
    let existingPlayerId: string | undefined;
    const existingEntry = [...clients.entries()].find(([, c]) => c.ws === ws && c.authenticated);
    if (existingEntry) {
        const [oldPlayerId, existingClient] = existingEntry;
        existingRoomId = existingClient.roomId;
        existingSeat = existingClient.seat;
        existingPlayerId = oldPlayerId;

        // Update room seat to use the new playerId
        if (existingRoomId && existingSeat !== undefined) {
            const room = rooms.get(existingRoomId);
            if (room && room.seats[existingSeat]) {
                room.seats[existingSeat] = {
                    seat: existingSeat,
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
                };
                rooms.set(existingRoomId, room);
            }
        }

        // Remove old entry
        clients.delete(oldPlayerId);
    }

    const client = {
        ws,
        playerId,
        authenticated: true,
        roomId: existingRoomId,
        seat: existingSeat,
    };
    clients.set(playerId, client);

    sendEnvelope(ws, createEnvelope("AUTH_OK", { playerId, token }));
    console.log(`Player authenticated: ${playerId}${existingPlayerId ? ` (replaced ${existingPlayerId.slice(0, 8)}, room: ${existingRoomId ?? "none"})` : ""}`);
}
