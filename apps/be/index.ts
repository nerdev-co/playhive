import { connectDb } from "@playhive/db";
import { PORT, WS_GATEWAY_URL } from "./config";
import { handleOptions, corsHeaders, createError, createResponse } from "./utils";
import {
    handleSignup,
    handleSignin,
    handleMe,
    handleProfile,
    handleGuest,
} from "./routes/auth";
import { getCurrentUser } from "./auth";
import {
    handleCreateRoom,
    handleListRooms,
    handleGetRoom,
} from "./routes/rooms";
import { handleHealth } from "./routes/health";
import { handleMatchList, handleMatchReplay } from "./routes/matches";
import {
    addToQueue,
    removeFromQueue,
    getQueueRank,
    setRoomGateway,
    setPlayerGateway,
} from "@playhive/db";

await connectDb();

// Gateway ID for this instance
const GATEWAY_ID = process.env.GATEWAY_ID ?? `gateway-${process.env.HOSTNAME ?? "local"}`;

const server = Bun.serve({
    port: PORT,
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;

        const optionsResponse = handleOptions(request);
        if (optionsResponse) return optionsResponse;

        try {
            if (path === "/auth/signup" && request.method === "POST") {
                return handleSignup(request);
            }

            if (path === "/auth/signin" && request.method === "POST") {
                return handleSignin(request);
            }

            if (path === "/auth/guest" && request.method === "POST") {
                return handleGuest(request);
            }

            if (path === "/auth/me" && request.method === "GET") {
                return handleMe(request);
            }

            if (path === "/auth/profile" && request.method === "GET") {
                return handleMe(request);
            }

            if (path === "/auth/profile" && request.method === "PUT") {
                return handleProfile(request);
            }

            if (path === "/rooms" && request.method === "POST") {
                return handleCreateRoom(request);
            }

            if (path === "/rooms" && request.method === "GET") {
                return handleListRooms(request);
            }

            if (path.match(/^\/rooms\/[^/]+$/) && request.method === "GET") {
                return handleGetRoom(request);
            }

            if (path === "/matches" && request.method === "GET") {
                return handleMatchList(request);
            }

            if (
                path.match(/^\/matches\/[^/]+\/replay$/) &&
                request.method === "GET"
            ) {
                return handleMatchReplay(request);
            }

            if (path === "/queue/join" && request.method === "POST") {
                const user = await getCurrentUser(request);
                if (!user) return createError("Unauthorized", 401);
                const body = await request.json() as { game: string; botFill?: boolean; fillAfterMs?: number };
                const { game } = body;
                if (!game) return createError("game required", 400);
                await addToQueue(game, user.id, Date.now());
                // Set player gateway for reconnect affinity
                await setPlayerGateway(user.id, GATEWAY_ID);
                return createResponse({
                    gatewayUrl: WS_GATEWAY_URL,
                    queuePosition: await getQueueRank(game, user.id),
                });
            }

            if (path === "/queue/leave" && request.method === "POST") {
                const user = await getCurrentUser(request);
                if (!user) return createError("Unauthorized", 401);
                const body = await request.json() as { game: string };
                const { game } = body;
                if (!game) return createError("game required", 400);
                await removeFromQueue(game, user.id);
                return createResponse({ ok: true });
            }

            if (path === "/queue/status" && request.method === "GET") {
                const user = await getCurrentUser(request);
                if (!user) return createError("Unauthorized", 401);
                const game = url.searchParams.get("game");
                if (!game) return createError("game required", 400);
                const rank = await getQueueRank(game, user.id);
                return createResponse({ queuePosition: rank });
            }

            if (path === "/health" && request.method === "GET") {
                return handleHealth();
            }

            return createError("Not found", 404);
        } catch (error) {
            console.error("Request error:", error);
            return createError("Internal server error", 500);
        }
    },
});

console.log(`Server running on http://localhost:${server.port}`);