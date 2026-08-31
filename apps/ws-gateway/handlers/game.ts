import { WebSocket } from "ws";

import { ErrorCode } from "@playhive/protocol";
import { createEnvelope } from "@playhive/protocol";

import {
    sendEnvelope,
    broadcastToRoom,
    clients,
    rooms,
    gameStates,
    generateId,
} from "../utils";
import {
    processGameAction,
    serializeGameState,
    createServerGameState,
} from "./gameEngine";
import {
    persistEvent,
    loadMatchByRoomId,
    finishMatch,
    rebuildState,
} from "./gamePersistence";

export function handleGameAction(
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

    let gs = gameStates.get(room.id);
    if (!gs) {
        const freshState = createServerGameState(room.gameType);
        if (!freshState) return;
        gs = {
            gameType: room.gameType,
            state: freshState,
            stateVersion: Date.now(),
        };
        gameStates.set(room.id, gs);
    }

    const stateVersion = Date.now();

    const result = processGameAction(
        room.gameType,
        gs.state,
        payload.action,
        payload.seat,
    );
    if (!result) return;

    gameStates.set(room.id, {
        gameType: room.gameType,
        state: result.state,
        stateVersion,
    });

    const clientState = serializeGameState(room.gameType, result.state);

    broadcastToRoom(
        room.id,
        createEnvelope("GAME_STATE", {
            kind: "snapshot",
            stateVersion,
            state: clientState,
        }),
    );

    // Persist event to DB (fire-and-forget)
    loadMatchByRoomId(room.id)
        .then((match) => {
            if (match) {
                persistEvent(
                    match.id,
                    result.events.length > 0 ? result.events.length : 1,
                    payload.seat,
                    payload.action as Record<string, unknown>,
                    playerId,
                ).catch((err) =>
                    console.error("[game] persistEvent failed:", err),
                );
            }
        })
        .catch((err) => console.error("[game] loadMatchByRoomId failed:", err));

    if (result.gameOver && result.result) {
        broadcastToRoom(
            room.id,
            createEnvelope("GAME_END", {
                result: {
                    winner: result.result.winner,
                    reason: result.result.reason,
                    dnf: [],
                },
                winner: result.result.winner,
                reason: result.result.reason,
                stats: {},
            }),
        );

        room.status = "FINISHED";
        room.endedAt = new Date().toISOString();
        rooms.set(room.id, room);

        // Finish match in DB (fire-and-forget)
        loadMatchByRoomId(room.id)
            .then((match) => {
                if (match) {
                    finishMatch(
                        match.id,
                        {
                            winner: result.result!.winner,
                            reason: result.result!.reason,
                        },
                        clientState ?? {},
                    ).catch((err) =>
                        console.error("[game] finishMatch failed:", err),
                    );
                }
            })
            .catch((err) =>
                console.error("[game] loadMatchByRoomId failed:", err),
            );
    }

    sendEnvelope(
        client.ws,
        createEnvelope("ACK", {
            requestId: generateId(),
            stateVersion,
        }),
    );
}

export async function handleRequestState(playerId: string): Promise<void> {
    try {
        const client = clients.get(playerId);
        if (!client || !client.roomId) return;

        const room = rooms.get(client.roomId);
        if (!room) return;

        // Game hasn't started yet — send room info so client knows gameType + who's in the room
        if (room.status !== "IN_PROGRESS") {
            sendEnvelope(
                client.ws,
                createEnvelope("ROOM_INFO", {
                    gameType: room.gameType,
                    status: room.status,
                    name: room.name,
                    hostId: room.hostId,
                    seats: room.seats,
                    maxPlayers: room.maxPlayers,
                }),
            );
            return;
        }

        let gs = gameStates.get(room.id);

        // If not in memory, try to rebuild from DB
        if (!gs) {
            const match = await loadMatchByRoomId(room.id);
            if (!match || match.status !== "IN_PROGRESS") return;

            const rebuilt = await rebuildState(room.gameType as any, match.id);
            if (!rebuilt) return;

            gs = {
                gameType: room.gameType,
                state: rebuilt.state,
                stateVersion: rebuilt.stateVersion,
            };
            gameStates.set(room.id, gs);
        }

        const clientState = serializeGameState(room.gameType, gs.state);

        sendEnvelope(
            client.ws,
            createEnvelope("GAME_STATE", {
                kind: "snapshot",
                stateVersion: gs.stateVersion,
                state: clientState,
            }),
        );
    } catch (err) {
        console.error("[game] handleRequestState failed:", err);
    }
}

export function handlePing(ws: WebSocket): void {
    sendEnvelope(ws, createEnvelope("PONG", {}));
}
