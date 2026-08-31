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
} from "@playhive/protocol";

import {
    validateEnvelope,
    createEnvelope as protocolCreateEnvelope,
    isClientMessage,
    parseEnvelope,
} from "@playhive/protocol";

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

import type { GameStateData } from "./handlers/gameEngine";

/** Server-side game state per room. Keyed by roomId. */
export const gameStates = new Map<string, {
    gameType: GameType;
    state: GameStateData;
    stateVersion: number;
}>();

export function generateId(): string {
    return crypto.randomUUID();
}

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SHORT_ID_LENGTH = 5;

export function generateShortId(): string {
    let id = "";
    const bytes = new Uint8Array(SHORT_ID_LENGTH);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < SHORT_ID_LENGTH; i++) {
        const byte = bytes[i];
        if (byte !== undefined) {
            const char = CHARS[byte % CHARS.length];
            if (char) id += char;
        }
    }
    return id;
}

export function sendEnvelope<T>(ws: WebSocket, envelope: Envelope<T>): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(envelope));
    }
}

export function sendError(ws: WebSocket, code: ErrorCode, message: string): void {
    sendEnvelope(ws, createEnvelope("ERROR", { code, message }));
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
