import { connectDb } from "@playhive/db";
import { PORT, WS_GATEWAY_URL } from "./config";
import { handleOptions, corsHeaders, createError, createResponse } from "./utils";
import { createLogger } from "./logger";
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
import { ErrorCode } from "@playhive/protocol";
import { bucketFor, checkRateLimit, rateLimitHeaders } from "./rateLimit";

const log = createLogger("be");

await connectDb();
log.info("Connected to database");

const GATEWAY_ID = process.env.GATEWAY_ID ?? `gateway-${process.env.HOSTNAME ?? "local"}`;

const server = Bun.serve({
    port: PORT,
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        const optionsResponse = handleOptions(request);
        if (optionsResponse) return optionsResponse;

        const requestId = crypto.randomUUID();
        const clientIp =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            request.headers.get("x-real-ip") ??
            "unknown";

        const rlExtra: Record<string, string> = {};

        if (path !== "/health" && path !== "/metrics") {
            const bucket = bucketFor(path);
            const rl = await checkRateLimit(clientIp, bucket);
            if (!rl.allowed) {
                log.warn("Rate limited", { requestId, ip: clientIp, path, method, bucket });
                return createError(
                    "Too many requests",
                    429,
                    "RATE_LIMITED" as ErrorCode,
                    rateLimitHeaders(rl.remaining, rl.resetAt),
                );
            }
            Object.assign(rlExtra, rateLimitHeaders(rl.remaining, rl.resetAt));
        }

        const start = Date.now();

        try {
            let response: Response;

            if (path === "/auth/signup" && method === "POST") {
                response = await handleSignup(request);
            } else if (path === "/auth/signin" && method === "POST") {
                response = await handleSignin(request);
            } else if (path === "/auth/guest" && method === "POST") {
                response = await handleGuest(request);
            } else if (path === "/auth/me" && method === "GET") {
                response = await handleMe(request);
            } else if (path === "/auth/profile" && method === "GET") {
                response = await handleMe(request);
            } else if (path === "/auth/profile" && method === "PUT") {
                response = await handleProfile(request);
            } else if (path === "/rooms" && method === "POST") {
                response = await handleCreateRoom(request);
            } else if (path === "/rooms" && method === "GET") {
                response = await handleListRooms(request);
            } else if (path.match(/^\/rooms\/[^/]+$/) && method === "GET") {
                response = await handleGetRoom(request);
            } else if (path === "/matches" && method === "GET") {
                response = await handleMatchList(request);
            } else if (path.match(/^\/matches\/[^/]+\/replay$/) && method === "GET") {
                response = await handleMatchReplay(request);
            } else if (path === "/queue/join" && method === "POST") {
                const user = await getCurrentUser(request);
                if (!user) return createError("Unauthorized", 401, ErrorCode.NOT_AUTHED);
                const body = (await request.json()) as { game: string; botFill?: boolean; fillAfterMs?: number };
                const { game } = body;
                if (!game) return createError("game required", 400, ErrorCode.BAD_REQUEST);
                await addToQueue(game, user.id, Date.now());
                await setPlayerGateway(user.id, GATEWAY_ID);
                response = createResponse({
                    gatewayUrl: WS_GATEWAY_URL,
                    queuePosition: await getQueueRank(game, user.id),
                });
            } else if (path === "/queue/leave" && method === "POST") {
                const user = await getCurrentUser(request);
                if (!user) return createError("Unauthorized", 401, ErrorCode.NOT_AUTHED);
                const body = (await request.json()) as { game: string };
                const { game } = body;
                if (!game) return createError("game required", 400, ErrorCode.BAD_REQUEST);
                await removeFromQueue(game, user.id);
                response = createResponse({ ok: true });
            } else if (path === "/queue/status" && method === "GET") {
                const user = await getCurrentUser(request);
                if (!user) return createError("Unauthorized", 401, ErrorCode.NOT_AUTHED);
                const game = url.searchParams.get("game");
                if (!game) return createError("game required", 400, ErrorCode.BAD_REQUEST);
                const rank = await getQueueRank(game, user.id);
                response = createResponse({ queuePosition: rank });
            } else if (path === "/health" && method === "GET") {
                response = handleHealth();
            } else if (path === "/metrics" && method === "GET") {
                response = createResponse({
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    timestamp: new Date().toISOString(),
                });
            } else {
                response = createError("Not found", 404, ErrorCode.BAD_REQUEST);
            }

            const headers = new Headers(response.headers);
            for (const [k, v] of Object.entries(rlExtra)) {
                headers.set(k, v);
            }
            headers.set("X-Request-ID", requestId);

            const elapsed = Date.now() - start;
            if (path !== "/health" && path !== "/metrics") {
                log.info(`${method} ${path}`, { requestId, status: response.status, ms: elapsed, ip: clientIp });
            }

            return new Response(response.body, {
                status: response.status,
                headers,
            });
        } catch (error) {
            const elapsed = Date.now() - start;
            log.error(`${method} ${path} FAILED`, {
                requestId,
                ms: elapsed,
                ip: clientIp,
                error: error instanceof Error ? error.message : String(error),
            });
            return createError("Internal server error", 500, ErrorCode.SERVER_ERROR);
        }
    },
});

log.info(`Server running on http://localhost:${server.port}`);
