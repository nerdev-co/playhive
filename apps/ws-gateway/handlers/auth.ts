import { WebSocket } from "ws";

import { createEnvelope } from "protocol";
import { sendEnvelope, clients, generateId } from "../utils";

export function handleAuth(ws: WebSocket, payload: { token: string }): void {
    const playerId = generateId();
    const token = `session-${generateId()}`;

    const client = {
        ws,
        playerId,
        authenticated: true,
    };
    clients.set(playerId, client);

    sendEnvelope(ws, createEnvelope("AUTH_OK", { playerId, token }));
    console.log(`Player authenticated: ${playerId}`);
}
