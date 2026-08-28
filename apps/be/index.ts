import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), "../../.env") });
import { connectDb, getDbInstance } from "@playhive/db";
import { hash, compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

// Connect to database on startup
await connectDb();

const db = getDbInstance();

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET ?? "dev-secret-change-in-production",
);
const JWT_ISSUER = "playhive-server";
const JWT_AUDIENCE = "playhive-client";
const TOKEN_EXPIRY = "7d";

const signupSchema = z.object({
    username: z
        .string()
        .min(3)
        .max(32)
        .regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().email().optional(),
    password: z.string().min(8).max(128),
    displayName: z.string().min(1).max(64).optional(),
});

const signinSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

const createRoomSchema = z.object({
    name: z.string().min(1).max(128),
    gameType: z.enum([
        "ludo",
        "chess",
        "snake-ladder",
        "checkers",
        "uno",
        "tic-tac-toe",
    ]),
    maxPlayers: z.number().int().min(2).max(8).default(4),
    private: z.boolean().default(false),
    settings: z
        .object({
            media: z.object({ voice: z.boolean(), video: z.boolean() }),
            maxPlayers: z.number().int().min(2).max(8),
            private: z.boolean(),
        })
        .optional(),
});

async function hashPassword(password: string): Promise<string> {
    return hash(password, 12);
}

async function verifyPassword(
    password: string,
    hash: string,
): Promise<boolean> {
    return compare(password, hash);
}

async function createToken(userId: string): Promise<string> {
    return new SignJWT({ sub: userId })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer(JWT_ISSUER)
        .setAudience(JWT_AUDIENCE)
        .setExpirationTime(TOKEN_EXPIRY)
        .setIssuedAt()
        .sign(JWT_SECRET);
}

async function verifyToken(token: string): Promise<{ sub: string } | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        });
        return { sub: payload.sub as string };
    } catch {
        return null;
    }
}

async function getCurrentUser(request: Request): Promise<{
    id: string;
    username: string;
    displayName: string;
    email: string | null;
    avatar: string | null;
    isGuest: boolean;
} | null> {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;

    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (!payload) return null;

    const user = await db.orm.public.User.where({ id: payload.sub }).first();
    if (!user) return null;

    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        avatar: user.avatar,
        isGuest: user.isGuest,
    };
}

function createResponse<T>(data: T, status = 200): Response {
    return Response.json(data, { status });
}

function createError(message: string, status = 400): Response {
    return Response.json({ error: message }, { status });
}

const server = Bun.serve({
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS headers
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // POST /auth/signup
            if (path === "/auth/signup" && request.method === "POST") {
                const body = await request.json();
                const parsed = signupSchema.safeParse(body);
                if (!parsed.success) {
                    return createError("Invalid input", 400);
                }

                const { username, email, password, displayName } = parsed.data;

                const existingUser = await db.orm.public.User.where({
                    username,
                }).first();
                if (existingUser) {
                    return createError("Username already taken", 409);
                }

                if (email) {
                    const existingEmail = await db.orm.public.User.where({
                        email,
                    }).first();
                    if (existingEmail) {
                        return createError("Email already registered", 409);
                    }
                }

                const passwordHash = await hashPassword(password);
                const user = await db.orm.public.User.create({
                    username,
                    email: email ?? null,
                    passwordHash,
                    displayName: displayName ?? username,
                    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
                    isGuest: false,
                });

                const token = await createToken(user.id);

                return createResponse(
                    {
                        user: {
                            id: user.id,
                            username: user.username,
                            displayName: user.displayName,
                            email: user.email,
                            avatar: user.avatar,
                            isGuest: user.isGuest,
                        },
                        token,
                    },
                    201,
                );
            }

            // POST /auth/signin
            if (path === "/auth/signin" && request.method === "POST") {
                const body = await request.json();
                const parsed = signinSchema.safeParse(body);
                if (!parsed.success) {
                    return createError("Invalid input", 400);
                }

                const { username, password } = parsed.data;

                const user = await db.orm.public.User.where({
                    username,
                }).first();
                if (!user || !user.passwordHash) {
                    return createError("Invalid credentials", 401);
                }

                const valid = await verifyPassword(password, user.passwordHash);
                if (!valid) {
                    return createError("Invalid credentials", 401);
                }

                const token = await createToken(user.id);

                return createResponse({
                    user: {
                        id: user.id,
                        username: user.username,
                        displayName: user.displayName,
                        email: user.email,
                        avatar: user.avatar,
                        isGuest: user.isGuest,
                    },
                    token,
                });
            }

            // GET /auth/me
            if (path === "/auth/me" && request.method === "GET") {
                const user = await getCurrentUser(request);
                if (!user) {
                    return createError("Unauthorized", 401);
                }
                return createResponse({ user });
            }

            // POST /rooms - create room
            if (path === "/rooms" && request.method === "POST") {
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
                        media: { voice: true, video: false },
                        maxPlayers,
                        private: isPrivate,
                    },
                    hostId: user.id,
                });

                // Add host as participant
                await db.orm.public.GameParticipant.create({
                    gameRoomId: room.id,
                    userId: user.id,
                    seatPosition: 0,
                    score: 0,
                    status: "ACTIVE",
                });

                return createResponse({ room }, 201);
            }

            // GET /rooms - list rooms
            if (path === "/rooms" && request.method === "GET") {
                const user = await getCurrentUser(request);
                if (!user) {
                    return createError("Unauthorized", 401);
                }

                const status = url.searchParams.get("status");
                const gameType = url.searchParams.get("gameType");
                const limit = parseInt(url.searchParams.get("limit") ?? "20");
                const offset = parseInt(url.searchParams.get("offset") ?? "0");

                const where: Record<string, unknown> = {};
                if (status) where.status = status;
                if (gameType) where.gameType = gameType;

                const rooms = await db.orm.public.GameRoom.where(where).all();

                // Sort by createdAt desc manually
                rooms.sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                );

                // Manual pagination
                const paginatedRooms = rooms.slice(offset, offset + limit);

                return createResponse({
                    rooms: paginatedRooms,
                    limit,
                    offset,
                    total: rooms.length,
                });
            }

            // GET /rooms/:id - get room details
            if (path.match(/^\/rooms\/[^/]+$/) && request.method === "GET") {
                const user = await getCurrentUser(request);
                if (!user) {
                    return createError("Unauthorized", 401);
                }

                const roomId = path.split("/")[2];
                const room = await db.orm.public.GameRoom.where({
                    id: roomId,
                }).first();
                if (!room) {
                    return createError("Room not found", 404);
                }

                const participants = await db.orm.public.GameParticipant.where({
                    gameRoomId: roomId,
                }).all();

                return createResponse({ room, participants });
            }

            // Health check
            if (path === "/health" && request.method === "GET") {
                return createResponse({
                    status: "ok",
                    timestamp: new Date().toISOString(),
                });
            }

            return createError("Not found", 404);
        } catch (error) {
            console.error("Request error:", error);
            return createError("Internal server error", 500);
        }
    },
});

console.log(`Server running on http://localhost:${server.port}`);
