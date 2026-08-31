import { WebSocket } from "ws";

import { type MessageType, type ClientMessageType, ErrorCode } from "@playhive/protocol";
import { isClientMessage, parseEnvelope } from "@playhive/protocol";

import { handleAuth } from "./auth";
import { handleCreateRoom, handleJoinRoom } from "./rooms";
import { handlePlayerReady, handleStartGame, handleLeaveRoom } from "./players";
import { handleGameAction, handleRequestState, handlePing } from "./game";
import { sendEnvelope, createEnvelope, clients, rooms, gameStates, broadcastToRoom, sendError, generateId } from "../utils";
import { createLogger } from "../logger";

const log = createLogger("ws-gw");

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
    const requestId = generateId();

    if (!isClientMessage(envelope.type)) {
        log.warn("Invalid message type", { requestId, playerId: playerId.slice(0, 8), type: envelope.type });
        sendError(ws, ErrorCode.BAD_REQUEST, "Invalid message type");
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
                    log.warn("Media target not connected", { requestId, playerId: playerId.slice(0, 8), target: to.slice(0, 8) });
                    sendError(ws, ErrorCode.INVALID_ACTION, "Target player not connected");
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
                    log.error("REQUEST_STATE failed", { requestId, playerId: playerId.slice(0, 8), error: err instanceof Error ? err.message : String(err) }),
                );
                break;
            }
            case "RESUME": {
                const { roomId } = envelope.payload as { roomId: string };
                const client = [...clients.entries()].find(([, c]) => c.ws === ws)?.[1];
                if (!client) {
                    log.warn("RESUME: no client found for ws", { requestId, playerId: playerId.slice(0, 8) });
                    break;
                }

                const room = rooms.get(roomId);
                if (!room) {
                    log.warn("RESUME: room not found", { requestId, playerId: playerId.slice(0, 8), roomId: roomId.slice(0, 8) });
                    sendError(ws, ErrorCode.ROOM_NOT_FOUND, "Room not found");
                    break;
                }

                let seatIdx = room.seats.findIndex(s => s.playerId === client.playerId);

                if (seatIdx === -1) {
                    const orphanIdx = room.seats.findIndex(s => {
                        if (!s.playerId) return false;
                        const occupant = clients.get(s.playerId);
                        return !occupant || (occupant.ws as WebSocket).readyState !== 1;
                    });
                    if (orphanIdx !== -1) {
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
                    log.info("RESUME: player seated", { requestId, playerId: client.playerId.slice(0, 8), seat: seatIdx, roomId: roomId.slice(0, 8) });

                    broadcastToRoom(
                        roomId,
                        createEnvelope("PLAYER_JOINED", {
                            seat: seatIdx,
                            player: claimedSeat.player,
                        }),
                        client.playerId,
                    );
                } else {
                    log.warn("RESUME: player could not find seat", { requestId, playerId: client.playerId.slice(0, 8), roomId: roomId.slice(0, 8) });
                    client.roomId = roomId;
                    client.seat = undefined;
                }

                handleRequestState(playerId).catch((err) =>
                    log.error("RESUME handleRequestState failed", { requestId, playerId: playerId.slice(0, 8), error: err instanceof Error ? err.message : String(err) }),
                );
                break;
            }
            default:
                log.warn("Unhandled message type", { requestId, playerId: playerId.slice(0, 8), type: envelope.type });
        }
    } catch (error) {
        log.error("Error handling message", { requestId, playerId: playerId.slice(0, 8), type: envelope.type, error: error instanceof Error ? error.message : String(error) });
        sendError(ws, ErrorCode.SERVER_ERROR, "Internal server error");
    }
}

export function handleConnection(ws: WebSocket): void {
    const connId = generateId();
    log.info("New connection", { connId });

    ws.on("message", (data: WebSocket.Data) => {
        try {
            const parsed = JSON.parse(data.toString());
            const envelope = parseEnvelope(parsed);
            log.info("Received message", { connId, type: envelope.type });

            if (envelope.type === "AUTH") {
                handleAuth(ws, envelope.payload as { token: string });
                return;
            }

            const playerId = [...clients.entries()].find(
                ([, c]) => c.ws === ws,
            )?.[0];
            if (!playerId) {
                log.warn("Message from unauthenticated client", { connId, type: envelope.type });
                sendError(ws, ErrorCode.NOT_AUTHED, "Not authenticated");
                return;
            }

            handleMessage(ws, playerId, envelope);
        } catch (error) {
            log.error("Message parse error", { connId, error: error instanceof Error ? error.message : String(error) });
            sendError(ws, ErrorCode.BAD_REQUEST, "Invalid message format");
        }
    });

    ws.on("close", () => {
        const playerId = [...clients.entries()].find(
            ([, c]) => c.ws === ws,
        )?.[0];
        if (!playerId) {
            log.info("Connection closed (unauthenticated)", { connId });
            return;
        }

        const client = clients.get(playerId);
        if (!client) return;

        if (client.roomId && client.seat !== undefined) {
            const room = rooms.get(client.roomId);
            if (room && room.status === "IN_PROGRESS") {
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

                const timer = setTimeout(() => {
                    disconnectTimers.delete(playerId);
                    const currentClient = clients.get(playerId);
                    if (currentClient && currentClient.ws !== ws) {
                        return;
                    }
                    handleLeaveRoom(playerId);
                    clients.delete(playerId);
                    log.info("Player removed after disconnect grace period", { connId, playerId: playerId.slice(0, 8) });
                }, DISCONNECT_GRACE_MS);

                disconnectTimers.set(playerId, timer);
                log.warn("Player disconnected, grace period started", { connId, playerId: playerId.slice(0, 8), roomId: client.roomId?.slice(0, 8), graceMs: DISCONNECT_GRACE_MS });
                return;
            }
        }

        handleLeaveRoom(playerId);
        clients.delete(playerId);
        log.info("Player disconnected", { connId, playerId: playerId.slice(0, 8) });
    });

    ws.on("error", (error: Error) => {
        log.error("WebSocket error", { connId, error: error.message });
    });
}
