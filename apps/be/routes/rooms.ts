import { URL } from "url";

import { createRoomSchema } from "../schemas";
import { getCurrentUser } from "../auth";
import { createResponse, createError } from "../utils";
import { getDbInstance } from "@playhive/db";
import { setRoomGateway } from "@playhive/db";

const db = getDbInstance();

// Gateway ID for this instance
const GATEWAY_ID = process.env.GATEWAY_ID ?? `gateway-${process.env.HOSTNAME ?? "local"}`;

export async function handleCreateRoom(request: Request): Promise<Response> {
    const user = await getCurrentUser(request);
    if (!user) {
        return createError("Unauthorized", 401);
    }

    const body = await request.json();
    const parsed = createRoomSchema.safeParse(body);
    if (!parsed.success) {
        return createError("Invalid input", 400);
    }

    const {
        name,
        gameType,
        maxPlayers,
        private: isPrivate,
        settings,
    } = parsed.data;

    const room = await db.orm.public.GameRoom.create({
        name,
        gameType,
        maxPlayers,
        status: "WAITING",
        settings: settings ?? {
            maxPlayers,
            private: isPrivate,
        },
        hostId: user.id,
    });

    await db.orm.public.GameParticipant.create({
        gameRoomId: room.id,
        userId: user.id,
        seatPosition: 0,
        score: 0,
        status: "ACTIVE",
    });

    // Set room gateway for reconnect affinity
    await setRoomGateway(room.id, GATEWAY_ID);

    return createResponse({ room }, 201);
}

export async function handleListRooms(request: Request): Promise<Response> {
    const user = await getCurrentUser(request);
    if (!user) {
        return createError("Unauthorized", 401);
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const gameType = url.searchParams.get("gameType");
    const limit = parseInt(url.searchParams.get("limit") ?? "20");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (gameType) where.gameType = gameType;

    const rooms = await db.orm.public.GameRoom.where(where).all();

    rooms.sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const paginatedRooms = rooms.slice(offset, offset + limit);

    return createResponse({
        rooms: paginatedRooms,
        limit,
        offset,
        total: rooms.length,
    });
}

export async function handleGetRoom(request: Request): Promise<Response> {
    const user = await getCurrentUser(request);
    if (!user) {
        return createError("Unauthorized", 401);
    }

    const url = new URL(request.url);
    const roomId = url.pathname.split("/")[2];
    const room = await db.orm.public.GameRoom.where({ id: roomId }).first();
    if (!room) {
        return createError("Room not found", 404);
    }

    const participants = await db.orm.public.GameParticipant.where({
        gameRoomId: roomId,
    }).all();

    return createResponse({ room, participants });
}
