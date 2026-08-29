import { z } from "zod";

export const signupSchema = z.object({
    username: z
        .string()
        .min(3)
        .max(32)
        .regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().email().optional(),
    password: z.string().min(8).max(128),
    displayName: z.string().min(1).max(64).optional(),
});

export const signinSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
});

export const createRoomSchema = z.object({
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

export const profileSchema = z.object({
    displayName: z.string().min(1).max(64).optional(),
    avatar: z.string().url().optional(),
});
