import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), "../../.env") });

export const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET ?? "dev-secret-change-in-production",
);
export const JWT_ISSUER = "playhive-server";
export const JWT_AUDIENCE = "playhive-client";
export const TOKEN_EXPIRY = "7d";

export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
