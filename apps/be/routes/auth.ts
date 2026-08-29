import { signupSchema, signinSchema, profileSchema } from "../schemas";
import {
    hashPassword,
    verifyPassword,
    createToken,
    getCurrentUser,
} from "../auth";
import { createResponse, createError } from "../utils";
import { getDbInstance } from "@playhive/db";
import { WS_GATEWAY_URL } from "../config";

const db = getDbInstance();

export async function handleSignup(request: Request): Promise<Response> {
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
        return createError("Invalid input", 400);
    }

    const { username, email, password, displayName } = parsed.data;

    const existingUser = await db.orm.public.User.where({ username }).first();
    if (existingUser) {
        return createError("Username already taken", 409);
    }

    if (email) {
        const existingEmail = await db.orm.public.User.where({ email }).first();
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
            gatewayUrl: WS_GATEWAY_URL,
        },
        201,
    );
}

export async function handleSignin(request: Request): Promise<Response> {
    const body = await request.json();
    const parsed = signinSchema.safeParse(body);
    if (!parsed.success) {
        return createError("Invalid input", 400);
    }

    const { username, password } = parsed.data;

    const user = await db.orm.public.User.where({ username }).first();
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
        gatewayUrl: WS_GATEWAY_URL,
    });
}

export async function handleMe(request: Request): Promise<Response> {
    const user = await getCurrentUser(request);
    if (!user) {
        return createError("Unauthorized", 401);
    }
    return createResponse({ user });
}

export async function handleProfile(request: Request): Promise<Response> {
    const user = await getCurrentUser(request);
    if (!user) {
        return createError("Unauthorized", 401);
    }

    const body = await request.json();
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
        return createError("Invalid input", 400);
    }

    const { displayName, avatar } = parsed.data;

    const updatedUser = await db.orm.public.User.where({ id: user.id }).update({
        displayName: displayName ?? user.displayName,
        avatar: avatar ?? user.avatar,
    });

    return createResponse({ user: updatedUser });
}
