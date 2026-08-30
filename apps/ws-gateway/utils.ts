import { WebSocket, WebSocketServer } from "ws";
import { createServer } from "http";

import {
    PROTOCOL_VERSION,
    type Envelope,
    type MessageType,
    type ClientMessageType,
    type ServerMessageType,
    type RoomSnapshot,
    type SeatInfo,
    type PlayerInfo,
    type GameType,
    type RoomStatus,
    type ParticipantStatus,
    ErrorCode,
} from "protocol";

import {
    validateEnvelope,
    createEnvelope as protocolCreateEnvelope,
    isClientMessage,
    parseEnvelope,
} from "protocol";

export const createEnvelope = protocolCreateEnvelope;

export interface ConnectedClient {
    ws: WebSocket;
    playerId: string;
    roomId?: string;
    seat?: number;
    authenticated: boolean;
}

export const clients = new Map<string, ConnectedClient>();
export const rooms = new Map<string, RoomSnapshot>();

/** Server-side game state per room. Keyed by roomId. */
export const gameStates = new Map<string, {
    gameType: GameType;
    state: Record<string, unknown>;
    stateVersion: number;
}>();

export function generateId(): string {
    return crypto.randomUUID();
}

export function generateInviteCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function generateInviteCodeFromId(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36).substring(0, 6).toUpperCase();
}

export function sendEnvelope<T>(ws: WebSocket, envelope: Envelope<T>): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(envelope));
    }
}

export function broadcastToRoom(
    roomId: string,
    envelope: Envelope,
    excludePlayerId?: string,
): void {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const seat of room.seats) {
        if (seat.playerId && seat.playerId !== excludePlayerId) {
            const client = [...clients.values()].find(
                (c) => c.playerId === seat.playerId,
            );
            if (client) sendEnvelope(client.ws, envelope);
        }
    }
}

export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3002;
