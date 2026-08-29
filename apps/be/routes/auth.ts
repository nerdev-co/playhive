import { signupSchema, signinSchema } from "../schemas";
import {
    hashPassword,
    verifyPassword,
    createToken,
    getCurrentUser,
} from "../auth";
import { createResponse, createError } from "../utils";
import { getDbInstance } from "@playhive/db";

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
    });
}

export async function handleMe(request: Request): Promise<Response> {
    const user = await getCurrentUser(request);
    if (!user) {
        return createError("Unauthorized", 401);
    }
    return createResponse({ user });
}
