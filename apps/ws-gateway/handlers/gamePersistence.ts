import { getDbInstance } from "@playhive/db";
import type { GameType } from "@playhive/protocol";
import type { GameStateData, GameAction } from "./engineAdapter";
import {
    createServerGameState,
    processGameAction,
} from "./gameEngine";

let dbReady = false;

async function getDb() {
    if (!dbReady) {
        const db = getDbInstance();
        await db.connect();
        dbReady = true;
    }
    return getDbInstance();
}

export async function createMatch(
    roomId: string,
    gameType: GameType,
    seats: Array<{ seat: number; playerId: string | null }>,
    config: Record<string, unknown>,
): Promise<string | null> {
    try {
        const db = await getDb();
        const match = await db.orm.public.Match.create({
            roomId,
            game: gameType,
            status: "IN_PROGRESS",
            seats: JSON.stringify(seats),
            config: JSON.stringify(config),
            startedAt: new Date().toISOString(),
        });
        return match.id;
    } catch (err) {
        console.error("[persistence] failed to create match:", err);
        return null;
    }
}

export async function persistEvent(
    matchId: string,
    version: number,
    seat: number,
    event: Record<string, unknown>,
    playerId?: string,
): Promise<void> {
    try {
        const db = await getDb();
        await db.orm.public.GameEvent.create({
            matchId,
            version: BigInt(version),
            seat,
            event: JSON.stringify(event),
            playerId: playerId ?? null,
        });
    } catch (err) {
        console.error("[persistence] failed to persist event:", err);
    }
}

export async function loadEvents(
    matchId: string,
): Promise<
    Array<{
        version: number;
        seat: number;
        event: Record<string, unknown>;
        playerId: string | null;
    }>
> {
    try {
        const db = await getDb();
        const rows = await db.orm.public.GameEvent.where({ matchId }).all();
        const sorted = rows.sort(
            (a: any, b: any) => Number(a.version) - Number(b.version),
        );
        return sorted.map((r: any) => ({
            version: Number(r.version),
            seat: r.seat ?? 0,
            event: typeof r.event === "string" ? JSON.parse(r.event) : r.event,
            playerId: r.playerId,
        }));
    } catch (err) {
        console.error("[persistence] failed to load events:", err);
        return [];
    }
}

export async function rebuildState(
    gameType: GameType,
    matchId: string,
): Promise<{ state: GameStateData; stateVersion: number } | null> {
    const events = await loadEvents(matchId);
    if (events.length === 0) return null;

    let state = createServerGameState(gameType);
    if (!state) return null;

    let stateVersion = 0;
    for (const evt of events) {
        const result = processGameAction(
            gameType,
            state,
            evt.event as GameAction,
            evt.seat,
        );
        if (result) {
            state = result.state;
            stateVersion = evt.version;
        }
    }

    return { state, stateVersion };
}

export async function loadMatchByRoomId(
    roomId: string,
): Promise<{ id: string; game: string; status: string } | null> {
    try {
        const db = await getDb();
        const match = await db.orm.public.Match.where({ roomId }).first();
        if (!match) return null;
        return { id: match.id, game: match.game, status: match.status };
    } catch (err) {
        console.error("[persistence] failed to load match:", err);
        return null;
    }
}

export async function finishMatch(
    matchId: string,
    result: Record<string, unknown>,
    finalState: Record<string, unknown>,
): Promise<void> {
    try {
        const db = await getDb();
        await db.orm.public.Match.where({ id: matchId }).update({
            status: "FINISHED",
            result: JSON.stringify(result),
            finalState: JSON.stringify(finalState),
            finishedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error("[persistence] failed to finish match:", err);
    }
}
