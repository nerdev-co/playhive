import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), "../../.env") });

export const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is required but not set in environment") })(),
);
export const JWT_ISSUER = process.env.JWT_ISSUER ?? "playhive-server";
export const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? "playhive-client";
export const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY ?? "7d";

export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

export const WS_GATEWAY_URL = process.env.WS_GATEWAY_URL ?? "ws://localhost:3002";
