import { WebSocket } from "ws";

import { createEnvelope } from "@playhive/protocol";
import { sendEnvelope, clients, rooms, generateId } from "../utils";
import { createLogger } from "../logger";

const log = createLogger("ws-auth");

export function handleAuth(ws: WebSocket, payload: { token: string }): void {
    const playerId = generateId();
    const token = `session-${generateId()}`;

    let existingRoomId: string | undefined;
    let existingSeat: number | undefined;
    let existingPlayerId: string | undefined;
    const existingEntry = [...clients.entries()].find(([, c]) => c.ws === ws && c.authenticated);
    if (existingEntry) {
        const [oldPlayerId, existingClient] = existingEntry;
        existingRoomId = existingClient.roomId;
        existingSeat = existingClient.seat;
        existingPlayerId = oldPlayerId;

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
    log.info("Player authenticated", { playerId: playerId.slice(0, 8), replaced: existingPlayerId?.slice(0, 8), roomId: existingRoomId?.slice(0, 8) });
}
