import { connectDb } from "@playhive/db";
import { PORT } from "./config";
import { handleOptions, corsHeaders, createError } from "./utils";
import { handleSignup, handleSignin, handleMe, handleProfile } from "./routes/auth";
import {
    handleCreateRoom,
    handleListRooms,
    handleGetRoom,
} from "./routes/rooms";
import { handleHealth } from "./routes/health";
import { handleMatchList, handleMatchReplay } from "./routes/matches";

await connectDb();

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

            if (path.match(/^\/matches\/[^/]+\/replay$/) && request.method === "GET") {
                return handleMatchReplay(request);
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