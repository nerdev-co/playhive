import { WebSocket } from "ws";

import { type MessageType, type ClientMessageType, ErrorCode } from "protocol";
import { isClientMessage, parseEnvelope } from "protocol";

import { handleAuth } from "./auth";
import { handleCreateRoom, handleJoinRoom } from "./rooms";
import { handlePlayerReady, handleStartGame, handleLeaveRoom } from "./players";
import { handleGameAction, handlePing } from "./game";
import { sendEnvelope, createEnvelope, clients, rooms, gameStates } from "../utils";

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
                handlePing(ws);
                break;
            case "RESUME": {
                const { roomId } = envelope.payload as { roomId: string };
                const client = [...clients.entries()].find(([, c]) => c.ws === ws)?.[1];
                if (!client) break;

                const room = rooms.get(roomId);
                if (!room || room.status !== "IN_PROGRESS") {
                    sendEnvelope(ws, createEnvelope("ERROR", {
                        code: ErrorCode.ROOM_NOT_FOUND,
                        message: "Game not in progress",
                    }));
                    break;
                }

                // Find the player's seat in this room
                const seatIdx = room.seats.findIndex(s => s.playerId === client.playerId);
                if (seatIdx === -1) {
                    sendEnvelope(ws, createEnvelope("ERROR", {
                        code: ErrorCode.FORBIDDEN,
                        message: "Not in this room",
                    }));
                    break;
                }

                // Re-associate client with room
                client.roomId = roomId;
                client.seat = seatIdx;

                // Send game state snapshot
                const gs = gameStates.get(roomId);
                if (gs) {
                    sendEnvelope(ws, createEnvelope("GAME_STATE", {
                        kind: "snapshot",
                        stateVersion: gs.stateVersion,
                        state: gs.state,
                    }));
                }
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
}
