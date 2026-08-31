import { createResponse, createError } from "../utils";
import { getCurrentUser } from "../auth";
import { getDbInstance } from "@playhive/db";
import { ErrorCode } from "@playhive/protocol";

const db = getDbInstance();

export async function handleMatchList(request: Request): Promise<Response> {
    const user = await getCurrentUser(request);
    if (!user) {
        return createError("Unauthorized", 401, ErrorCode.NOT_AUTHED);
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "20");
    const offset = parseInt(url.searchParams.get("offset") ?? "0");
    const status = url.searchParams.get("status");

    const where: Record<string, unknown> = {
        seats: {
            some: { playerId: user.id },
        },
    };
    if (status) where.status = status;

    const matches = await db.orm.public.Match.where(where).all();

    // Sort by startedAt desc manually
    matches.sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime());

    // Manual pagination
    const paginatedMatches = matches.slice(offset, offset + limit);

    return createResponse({
        matches: paginatedMatches,
        limit,
        offset,
        total: matches.length,
    });
}

export async function handleMatchReplay(request: Request): Promise<Response> {
    const user = await getCurrentUser(request);
    if (!user) {
        return createError("Unauthorized", 401, ErrorCode.NOT_AUTHED);
    }

    const url = new URL(request.url);
    const matchId = url.pathname.split("/")[2];

    const match = await db.orm.public.Match.where({ id: matchId }).first();
    if (!match) {
        return createError("Match not found", 404, ErrorCode.ROOM_NOT_FOUND);
    }

    // Verify user participated in this match
    const seats = match.seats as { playerId: string }[];
    const isParticipant = seats.some((s) => s.playerId === user.id);
    if (!isParticipant) {
        return createError("Forbidden", 403, ErrorCode.FORBIDDEN);
    }

    const events = await db.orm.public.GameEvent.where({ matchId }).all();

    // Sort by version asc manually
    events.sort((a, b) => Number(a.version) - Number(b.version));

    return createResponse({
        match: {
            id: match.id,
            game: match.game,
            status: match.status,
            seats: match.seats,
            result: match.result,
            startedAt: match.startedAt,
            finishedAt: match.finishedAt,
        },
        events,
    });
}