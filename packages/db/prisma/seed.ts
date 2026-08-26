import "@js-temporal/polyfill";
import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "../src/prisma/contract.d";
import contractJson from "../src/prisma/contract.json" with { type: "json" };
import { hash } from "bcryptjs";
import type { RoomStatus, ParticipantStatus, MatchStatus } from "../src/types";

const db = postgres<Contract>({
    contractJson,
    url: process.env["DATABASE_URL"]!,
});

async function main() {
    console.log(" Seeding database...");

    const passwordHash = await hash("password123", 12);

    // Check if users exist
    let user1 = await db.orm.public.User.where({ username: "alice" }).first();
    if (!user1) {
        user1 = await db.orm.public.User.create({
            username: "alice",
            displayName: "Alice",
            email: "alice@example.com",
            passwordHash,
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice",
            isGuest: false,
        });
    }

    let user2 = await db.orm.public.User.where({ username: "bob" }).first();
    if (!user2) {
        user2 = await db.orm.public.User.create({
            username: "bob",
            displayName: "Bob",
            email: "bob@example.com",
            passwordHash,
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
            isGuest: false,
        });
    }

    let guestUser = await db.orm.public.User.where({
        username: "guest_001",
    }).first();
    if (!guestUser) {
        guestUser = await db.orm.public.User.create({
            username: "guest_001",
            displayName: "Guest Player",
            isGuest: true,
        });
    }

    console.log(" Users created");

    // Check if room exists
    let room = await db.orm.public.GameRoom.where({
        name: "Ludo Match #1",
    }).first();
    if (!room) {
        room = await db.orm.public.GameRoom.create({
            name: "Ludo Match #1",
            gameType: "ludo",
            maxPlayers: 4,
            status: "WAITING" satisfies RoomStatus,
            settings: {
                media: { voice: true, video: false },
                maxPlayers: 4,
                private: true,
            },
            hostId: user1.id,
        });

        // Create participants separately
        await db.orm.public.GameParticipant.create({
            gameRoomId: room.id,
            userId: user1.id,
            seatPosition: 0,
            score: 0,
            status: "ACTIVE" satisfies ParticipantStatus,
        });

        await db.orm.public.GameParticipant.create({
            gameRoomId: room.id,
            userId: user2.id,
            seatPosition: 1,
            score: 0,
            status: "ACTIVE" satisfies ParticipantStatus,
        });
    }

    console.log(" Room created:", room.id);

    // Check if match exists
    let match = await db.orm.public.Match.where({ roomId: room.id }).first();
    if (!match) {
        match = await db.orm.public.Match.create({
            roomId: room.id,
            game: "ludo",
            status: "IN_PROGRESS" satisfies MatchStatus,
            seats: [
                { seat: 0, playerId: user1.id, bot: false, result: null },
                { seat: 1, playerId: user2.id, bot: false, result: null },
            ],
            config: { maxPlayers: 4, media: { voice: true, video: false } },
            startedAt: new Date().toISOString(),
        });
    }

    console.log(" Match created:", match.id);

    // Check if events exist
    const existingEvents = await db.orm.public.GameEvent.where({
        matchId: match.id,
    }).all();
    if (existingEvents.length === 0) {
        const events = [
            {
                version: 1n,
                seat: 0,
                event: { type: "dice", value: 4 },
                playerId: user1.id,
            },
            {
                version: 2n,
                seat: 0,
                event: { type: "move", token: 0, from: 0, to: 4 },
                playerId: user1.id,
            },
            {
                version: 3n,
                seat: 1,
                event: { type: "dice", value: 6 },
                playerId: user2.id,
            },
            {
                version: 4n,
                seat: 1,
                event: { type: "move", token: 0, from: 0, to: 6 },
                playerId: user2.id,
            },
            {
                version: 5n,
                seat: 1,
                event: { type: "dice", value: 3 },
                playerId: user2.id,
            },
            {
                version: 6n,
                seat: 1,
                event: { type: "move", token: 0, from: 6, to: 9 },
                playerId: user2.id,
            },
        ];

        for (const e of events) {
            await db.orm.public.GameEvent.create({
                matchId: match.id,
                version: e.version,
                seat: e.seat,
                event: e.event,
                playerId: e.playerId,
            });
        }
        console.log(" Game events created");
    } else {
        console.log(" Game events already exist");
    }

    console.log(" Seeding complete!");
}

main()
    .catch((e) => {
        console.error(" Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await db.close();
    });

