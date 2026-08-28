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
    createEnvelope,
    isClientMessage,
    parseEnvelope,
} from "protocol";

interface ConnectedClient {
    ws: WebSocket;
    playerId: string;
    roomId?: string;
    seat?: number;
    authenticated: boolean;
}

const clients = new Map<string, ConnectedClient>();
const rooms = new Map<string, RoomSnapshot>();

function generateId(): string {
    return crypto.randomUUID();
}

function generateInviteCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function sendEnvelope<T>(ws: WebSocket, envelope: Envelope<T>): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(envelope));
    }
}

function broadcastToRoom(
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

function handleAuth(ws: WebSocket, payload: { token: string }): void {
    const playerId = generateId();
    const token = `session-${generateId()}`;

    const client: ConnectedClient = {
        ws,
        playerId,
        authenticated: true,
    };
    clients.set(playerId, client);

    sendEnvelope(ws, createEnvelope("AUTH_OK", { playerId, token }));
    console.log(`Player authenticated: ${playerId}`);
}

function handleCreateRoom(
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

function handleJoinRoom(
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

function generateInviteCodeFromId(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36).substring(0, 6).toUpperCase();
}

function handlePlayerReady(playerId: string, ready: boolean): void {
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

function handleStartGame(ws: WebSocket, playerId: string): void {
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

function handleGameAction(
    playerId: string,
    payload: { seat: number; action: { type: string; [key: string]: unknown } },
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

function handleLeaveRoom(playerId: string): void {
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

function handleMessage(
    ws: WebSocket,
    playerId: string,
    envelope: Envelope,
): void {
    if (!isClientMessage(envelope.type)) {
        sendEnvelope(
            ws,
            createEnvelope("ERROR", {
                code: ErrorCode.BAD_REQUEST,
                message: "Invalid message type",
            }),
        );
        return;
    }

    try {
        switch (envelope.type) {
            case "CREATE_ROOM":
                handleCreateRoom(
                    ws,
                    playerId,
                    envelope.payload as {
                        game: GameType;
                        maxPlayers: number;
                        private: boolean;
                        settings: {
                            media: { voice: boolean; video: boolean };
                            maxPlayers: number;
                            private: boolean;
                        };
                    },
                );
                break;
            case "JOIN_ROOM":
                handleJoinRoom(
                    ws,
                    playerId,
                    envelope.payload as {
                        inviteCode: string;
                        media: { voice: boolean; video: boolean };
                    },
                );
                break;
            case "PLAYER_READY":
                handlePlayerReady(playerId, true);
                break;
            case "PLAYER_UNREADY":
                handlePlayerReady(playerId, false);
                break;
            case "START_GAME":
                handleStartGame(ws, playerId);
                break;
            case "GAME_ACTION":
                handleGameAction(
                    playerId,
                    envelope.payload as {
                        seat: number;
                        action: { type: string; [key: string]: unknown };
                    },
                );
                break;
            case "LEAVE_ROOM":
                handleLeaveRoom(playerId);
                break;
            case "PING":
                sendEnvelope(ws, createEnvelope("PONG", {}));
                break;
            default:
                console.log(`Unhandled message type: ${envelope.type}`);
        }
    } catch (error) {
        console.error(`Error handling ${envelope.type}:`, error);
        sendEnvelope(
            ws,
            createEnvelope("ERROR", {
                code: ErrorCode.SERVER_ERROR,
                message: "Internal server error",
            }),
        );
    }
}

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
    console.log("New connection");

    ws.on("message", (data: WebSocket.Data) => {
        try {
            const envelope = parseEnvelope(JSON.parse(data.toString()));

            if (envelope.type === "AUTH") {
                handleAuth(ws, envelope.payload as { token: string });
                return;
            }

            const playerId = [...clients.entries()].find(
                ([, c]) => c.ws === ws,
            )?.[0];
            if (!playerId) {
                sendEnvelope(
                    ws,
                    createEnvelope("ERROR", {
                        code: ErrorCode.NOT_AUTHED,
                        message: "Not authenticated",
                    }),
                );
                return;
            }

            handleMessage(ws, playerId, envelope);
        } catch (error) {
            console.error("Message parse error:", error);
            sendEnvelope(
                ws,
                createEnvelope("ERROR", {
                    code: ErrorCode.BAD_REQUEST,
                    message: "Invalid message format",
                }),
            );
        }
    });

    ws.on("close", () => {
        const playerId = [...clients.entries()].find(
            ([, c]) => c.ws === ws,
        )?.[0];
        if (playerId) {
            handleLeaveRoom(playerId);
            clients.delete(playerId);
            console.log(`Player disconnected: ${playerId}`);
        }
    });

    ws.on("error", (error: Error) => {
        console.error("WebSocket error:", error);
    });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

server.listen(PORT, () => {
    console.log(`WS Gateway listening on port ${PORT}`);
});
