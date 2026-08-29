import { hash, compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

import { JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE, TOKEN_EXPIRY } from "./config";
import { getDbInstance } from "@playhive/db";

const db = getDbInstance();

export async function hashPassword(password: string): Promise<string> {
    return hash(password, 12);
}

export async function verifyPassword(
    password: string,
    hash: string,
): Promise<boolean> {
    return compare(password, hash);
}

export async function createToken(userId: string): Promise<string> {
    return new SignJWT({ sub: userId })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer(JWT_ISSUER)
        .setAudience(JWT_AUDIENCE)
        .setExpirationTime(TOKEN_EXPIRY)
        .setIssuedAt()
        .sign(JWT_SECRET);
}

export async function verifyToken(
    token: string,
): Promise<{ sub: string } | null> {
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

export async function getCurrentUser(request: Request): Promise<{
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
