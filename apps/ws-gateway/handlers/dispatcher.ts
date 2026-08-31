import { WebSocket } from "ws";

import { type MessageType, type ClientMessageType, ErrorCode } from "@playhive/protocol";
import { isClientMessage, parseEnvelope } from "@playhive/protocol";

import { handleAuth } from "./auth";
import { handleCreateRoom, handleJoinRoom } from "./rooms";
import { handlePlayerReady, handleStartGame, handleLeaveRoom } from "./players";
import { handleGameAction, handleRequestState, handlePing } from "./game";
import { sendEnvelope, createEnvelope, clients, rooms, gameStates, broadcastToRoom } from "../utils";

function wsLog(level: "info" | "warn" | "error", msg: string, data?: Record<string, unknown>) {
    const ts = new Date().toISOString();
    const base = `${ts} [${level.toUpperCase().padEnd(5)}] [ws-gw] ${msg}`;
    const out = data ? `${base} ${JSON.stringify(data)}` : base;
    if (level === "error") console.error(out);
    else if (level === "warn") console.warn(out);
    else console.log(out);
}

/** Grace period (ms) before a disconnected player is removed from a room. */
const DISCONNECT_GRACE_MS = 30_000;

/** Timers for disconnected players — keyed by playerId. */
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function handleMessage(
    ws: WebSocket,
    playerId: string,
    envelope: {
        type: MessageType;
        payload: unknown;
    },
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
                        game: import("protocol").GameType;
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
                        roomId: string;
                    },
                );
                break;
            case "LIST_ROOMS": {
                const publicRooms = [...rooms.values()]
                    .filter(r => r.status === "WAITING" && !r.settings?.private)
                    .map(r => ({
                        id: r.id,
                        name: r.name,
                        gameType: r.gameType,
                        maxPlayers: r.maxPlayers,
                        status: r.status,
                        hostId: r.hostId,
                        seats: r.seats,
                        settings: r.settings,
                        createdAt: r.createdAt,
                    }));
                sendEnvelope(ws, createEnvelope("ROOM_LIST", { rooms: publicRooms }));
                break;
            }
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
            case "MEDIA_OFFER":
            case "MEDIA_ANSWER":
            case "MEDIA_ICE": {
                const { to } = envelope.payload as { to: string };
                const target = clients.get(to);
                if (!target) {
                    sendEnvelope(ws, createEnvelope("ERROR", {
                        code: ErrorCode.INVALID_ACTION,
                        message: "Target player not connected",
                    }));
                    break;
                }
                sendEnvelope(target.ws, createEnvelope(envelope.type, {
                    from: playerId,
                    payload: (envelope.payload as { payload: unknown }).payload,
                }));
                break;
            }
            case "PING":
                handlePing(ws);
                break;
            case "REQUEST_STATE": {
                handleRequestState(playerId).catch((err) =>
                    console.error("[dispatcher] REQUEST_STATE failed:", err),
                );
                break;
            }
            case "RESUME": {
                const { roomId } = envelope.payload as { roomId: string };
                const client = [...clients.entries()].find(([, c]) => c.ws === ws)?.[1];
                if (!client) {
                    console.log(`[ws] RESUME: no client found for ws`);
                    break;
                }

                const room = rooms.get(roomId);
                if (!room) {
                    console.log(`[ws] RESUME: room ${roomId} not found`);
                    sendEnvelope(ws, createEnvelope("ERROR", {
                        code: ErrorCode.ROOM_NOT_FOUND,
                        message: "Room not found",
                    }));
                    break;
                }

                // Find the player's seat in this room
                let seatIdx = room.seats.findIndex(s => s.playerId === client.playerId);

                if (seatIdx === -1) {
                    // Player not in any seat — check for orphaned seat (dead/old client)
                    const orphanIdx = room.seats.findIndex(s => {
                        if (!s.playerId) return false;
                        const occupant = clients.get(s.playerId);
                        // Seat is orphaned if occupant doesn't exist or has a dead ws
                        return !occupant || (occupant.ws as WebSocket).readyState !== 1; // 1 = OPEN
                    });
                    if (orphanIdx !== -1) {
                        // Take over orphaned seat
                        const oldId = room.seats[orphanIdx]?.playerId;
                        if (oldId) clients.delete(oldId);
                        room.seats[orphanIdx] = {
                            seat: orphanIdx,
                            playerId: client.playerId,
                            player: {
                                id: client.playerId,
                                username: `player_${client.playerId.slice(0, 8)}`,
                                displayName: `Player ${client.playerId.slice(0, 8)}`,
                                isGuest: true,
                            },
                            bot: false,
                            status: "ACTIVE",
                            ready: true,
                            score: 0,
                        };
                        seatIdx = orphanIdx;
                    } else {
                        // Try empty seat
                        const emptySeat = room.seats.findIndex(s => s.playerId === null);
                        if (emptySeat !== -1) {
                            room.seats[emptySeat] = {
                                seat: emptySeat,
                                playerId: client.playerId,
                                player: {
                                    id: client.playerId,
                                    username: `player_${client.playerId.slice(0, 8)}`,
                                    displayName: `Player ${client.playerId.slice(0, 8)}`,
                                    isGuest: true,
                                },
                                bot: false,
                                status: "ACTIVE",
                                ready: true,
                                score: 0,
                            };
                            seatIdx = emptySeat;
                        }
                    }
                }

                const claimedSeat = seatIdx !== -1 ? room.seats[seatIdx] : undefined;
                if (claimedSeat) {
                    client.roomId = roomId;
                    client.seat = seatIdx;
                    claimedSeat.ready = true;
                    rooms.set(roomId, room);
                    console.log(`[ws] RESUME: player ${client.playerId.slice(0, 8)} seated at ${seatIdx} in room ${roomId.slice(0, 8)}`);

                    broadcastToRoom(
                        roomId,
                        createEnvelope("PLAYER_JOINED", {
                            seat: seatIdx,
                            player: claimedSeat.player,
                        }),
                        client.playerId,
                    );
                } else {
                    console.log(`[ws] RESUME: player ${client.playerId.slice(0, 8)} could not find seat in room ${roomId.slice(0, 8)}`);
                    client.roomId = roomId;
                    client.seat = undefined;
                }

                // Send game state or room info
                handleRequestState(playerId).catch((err) =>
                    console.error("[dispatcher] RESUME handleRequestState failed:", err),
                );
                break;
            }
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

export function handleConnection(ws: WebSocket): void {
    console.log("New connection");

    ws.on("message", (data: WebSocket.Data) => {
        try {
            const envelope = parseEnvelope(JSON.parse(data.toString()));
            console.log(`[ws] recv: ${envelope.type}`);

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
        if (!playerId) return;

        const client = clients.get(playerId);
        if (!client) return;

        // If player is in an active game, start grace period instead of immediate leave
        if (client.roomId && client.seat !== undefined) {
            const room = rooms.get(client.roomId);
            if (room && room.status === "IN_PROGRESS") {
                // Mark seat as disconnected
                const seat = room.seats[client.seat];
                if (seat) {
                    seat.status = "DISCONNECTED";
                    rooms.set(room.id, room);
                }

                broadcastToRoom(
                    client.roomId,
                    createEnvelope("PLAYER_DISCONNECTED", {
                        seat: client.seat,
                    }),
                );

                // Start grace period timer
                const timer = setTimeout(() => {
                    disconnectTimers.delete(playerId);
                    // Check if player reconnected (ws changed)
                    const currentClient = clients.get(playerId);
                    if (currentClient && currentClient.ws !== ws) {
                        // Player reconnected with new socket — don't remove
                        return;
                    }
                    // Player didn't reconnect — remove from room
                    handleLeaveRoom(playerId);
                    clients.delete(playerId);
                    console.log(`Player ${playerId} removed after disconnect grace period`);
                }, DISCONNECT_GRACE_MS);

                disconnectTimers.set(playerId, timer);
                console.log(`Player ${playerId} disconnected, grace period started (${DISCONNECT_GRACE_MS}ms)`);
                return;
            }
        }

        // Not in a game — immediate cleanup
        handleLeaveRoom(playerId);
        clients.delete(playerId);
        console.log(`Player disconnected: ${playerId}`);
    });

    ws.on("error", (error: Error) => {
        console.error("WebSocket error:", error);
    });
}
