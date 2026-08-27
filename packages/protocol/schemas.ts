import { z } from "zod";

import {
    PROTOCOL_VERSION,
    ErrorCode,
    type GameType,
    type RoomStatus,
    type ParticipantStatus,
    type IceCandidateInit,
    type ClientMessageType,
    type ServerMessageType,
} from "./types";

/** UUID string validation schema */
const uuidSchema = z.string().uuid();
/** ISO 8601 timestamp with timezone offset */
const timestampSchema = z.string().datetime({ offset: true });
/** Positive integer (> 0) */
const positiveIntSchema = z.number().int().positive();
/** Non-negative integer (>= 0) */
const nonNegativeIntSchema = z.number().int().nonnegative();

/**
 * Zod schema for MediaSettings validation.
 * Validates voice and video boolean flags.
 */
export const MediaSettingsSchema = z.object({
    /** Voice chat enabled */
    voice: z.boolean(),
    /** Video chat enabled */
    video: z.boolean(),
});

/**
 * Zod schema for RoomSettings validation.
 * Enforces max 8 players.
 */
export const RoomSettingsSchema = z.object({
    /** Media configuration */
    media: MediaSettingsSchema,
    /** Maximum players (1-8) */
    maxPlayers: positiveIntSchema.max(8),
    /** Private room flag */
    private: z.boolean(),
});

/**
 * Zod schema for PlayerInfo validation.
 * Enforces username length 1-32, displayName 1-64, valid avatar URL.
 */
export const PlayerInfoSchema = z.object({
    /** Player UUID */
    id: uuidSchema,
    /** Username (1-32 chars) */
    username: z.string().min(1).max(32),
    /** Display name (1-64 chars) */
    displayName: z.string().min(1).max(64),
    /** Optional avatar URL */
    avatar: z.string().url().optional(),
    /** Guest account flag */
    isGuest: z.boolean(),
});

/**
 * Zod schema for SeatInfo validation.
 * Validates seat index, player references, bot flag, status enum, ready flag, score.
 */
export const SeatInfoSchema = z.object({
    /** Seat index (0-based) */
    seat: nonNegativeIntSchema,
    /** Occupying player UUID or null */
    playerId: uuidSchema.nullable(),
    /** Full player info (optional in some contexts) */
    player: PlayerInfoSchema.nullable().optional(),
    /** Bot flag */
    bot: z.boolean(),
    /** Participant status */
    status: z.enum(["ACTIVE", "LEFT", "KICKED", "DISCONNECTED", "FORFEITED"]),
    /** Ready state */
    ready: z.boolean(),
    /** Current score */
    score: nonNegativeIntSchema,
});

/**
 * Zod schema for RoomSnapshot validation.
 * Complete room state including all seats and metadata.
 */
export const RoomSnapshotSchema = z.object({
    /** Room UUID */
    id: uuidSchema,
    /** Room name (1-128 chars) */
    name: z.string().min(1).max(128),
    /** Game type enum */
    gameType: z.enum([
        "ludo",
        "chess",
        "snake-ladder",
        "checkers",
        "uno",
        "tic-tac-toe",
    ]),
    /** Max players (1-8) */
    maxPlayers: positiveIntSchema.max(8),
    /** Room status enum */
    status: z.enum([
        "WAITING",
        "STARTING",
        "IN_PROGRESS",
        "FINISHED",
        "ARCHIVED",
    ]),
    /** Room settings */
    settings: RoomSettingsSchema,
    /** Host player UUID */
    hostId: uuidSchema,
    /** Array of seat assignments */
    seats: z.array(SeatInfoSchema),
    /** Creation timestamp */
    createdAt: timestampSchema,
    /** Optional game start timestamp */
    startedAt: timestampSchema.optional(),
    /** Optional game end timestamp */
    endedAt: timestampSchema.optional(),
});

/**
 * Zod schema for MatchConfig validation.
 * Subset of room settings used at game start.
 */
export const MatchConfigSchema = z.object({
    /** Max players (1-8) */
    maxPlayers: positiveIntSchema.max(8),
    /** Media settings */
    media: MediaSettingsSchema,
    /** Private match flag */
    private: z.boolean(),
});

/**
 * Zod schema for MatchResult validation.
 * Winner UUID, end reason, list of players who didn't finish.
 */
export const MatchResultSchema = z.object({
    /** Winner UUID or null for draw */
    winner: uuidSchema.nullable(),
    /** End reason string */
    reason: z.string(),
    /** DNF player UUIDs */
    dnf: z.array(uuidSchema),
});

/**
 * Base schema for engine actions.
 * Requires a type string and allows arbitrary additional fields.
 */
const BaseActionSchema = z
    .object({
        /** Action type discriminator */
        type: z.string(),
    })
    .passthrough();

/**
 * Zod schema for LudoAction validation.
 * ROLL_DICE or MOVE_TOKEN with optional token/from/to positions.
 */
export const LudoActionSchema = BaseActionSchema.extend({
    type: z.enum(["ROLL_DICE", "MOVE_TOKEN"]),
    /** Token index */
    token: z.number().int().optional(),
    /** Source position */
    from: z.number().int().optional(),
    /** Destination position */
    to: z.number().int().optional(),
});

/**
 * Zod schema for ChessAction validation.
 * MOVE with algebraic notation squares, optional promotion.
 */
export const ChessActionSchema = BaseActionSchema.extend({
    type: z.literal("MOVE"),
    /** Source square (e.g., "e2") */
    from: z.string().regex(/^[a-h][1-8]$/),
    /** Destination square (e.g., "e4") */
    to: z.string().regex(/^[a-h][1-8]$/),
    /** Promotion piece */
    promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

/**
 * Zod schema for LudoEvent validation.
 * All ludo event types with optional contextual fields.
 */
export const LudoEventSchema = z.object({
    /** Event type */
    type: z.enum([
        "dice",
        "move",
        "captured",
        "born",
        "ascend",
        "turn_start",
        "turn_end",
    ]),
    /** Dice value for dice events */
    value: z.number().int().optional(),
    /** Token index */
    token: z.number().int().optional(),
    /** Source position */
    from: z.number().int().optional(),
    /** Destination position */
    to: z.number().int().optional(),
    /** Return position for captured */
    backTo: z.string().optional(),
    /** Acting seat */
    seat: z.number().int().optional(),
});

/**
 * Zod schema for ChessEvent validation.
 * Move events with full chess notation details.
 */
export const ChessEventSchema = z.object({
    type: z.literal("move"),
    /** Source square */
    from: z.string().regex(/^[a-h][1-8]$/),
    /** Destination square */
    to: z.string().regex(/^[a-h][1-8]$/),
    /** Piece moved */
    piece: z.string(),
    /** Captured piece */
    captured: z.string().optional(),
    /** Promotion piece */
    promotion: z.string().optional(),
    /** Check flag */
    check: z.boolean().optional(),
    /** Checkmate flag */
    checkmate: z.boolean().optional(),
    /** Acting seat */
    seat: z.number().int(),
});

/**
 * Zod schema for GameEvent validation.
 * Union of LudoEvent, ChessEvent, and arbitrary objects for extensibility.
 */
export const GameEventSchema = z.union([
    LudoEventSchema,
    ChessEventSchema,
    z.record(z.unknown()),
]);

/**
 * Zod schema for GameState validation.
 * Opaque record - structure defined by game engine.
 */
export const GameStateSchema = z.record(z.unknown());

/**
 * Zod schema for Envelope validation.
 * Validates protocol version, message type, optional IDs, and unknown payload.
 */
export const EnvelopeSchema = z.object({
    /** Protocol version literal */
    v: z.literal(PROTOCOL_VERSION),
    /** Message type string */
    type: z.string(),
    /** Optional request UUID */
    requestId: uuidSchema.optional(),
    /** Optional room UUID */
    roomId: uuidSchema.optional(),
    /** Payload (validated separately by type) */
    payload: z.unknown(),
});

/**
 * Zod schema for ICE candidate validation.
 * Matches RTCIceCandidateInit fields.
 */
const IceCandidateSchema = z.object({
    /** Candidate string */
    candidate: z.string(),
    /** SDP mid */
    sdpMid: z.string().optional(),
    /** SDP m-line index */
    sdpMLineIndex: z.number().int().optional(),
    /** Username fragment */
    usernameFragment: z.string().optional(),
});

/**
 * Map of client message types to their payload validation schemas.
 * Used by validateClientMessage for type-safe payload validation.
 */
export const ClientPayloadSchemas: Record<ClientMessageType, z.ZodTypeAny> = {
    /** Authenticate with token */
    AUTH: z.object({ token: z.string().min(1) }),
    /** Resume session in room */
    RESUME: z.object({
        roomId: uuidSchema,
        lastStateVersion: nonNegativeIntSchema,
        lastSeq: nonNegativeIntSchema.optional(),
    }),
    /** Create new room */
    CREATE_ROOM: z.object({
        game: z.enum([
            "ludo",
            "chess",
            "snake-ladder",
            "checkers",
            "uno",
            "tic-tac-toe",
        ]),
        maxPlayers: positiveIntSchema.max(8),
        private: z.boolean(),
        settings: RoomSettingsSchema,
    }),
    /** Join room by invite code */
    JOIN_ROOM: z.object({
        inviteCode: z.string().min(1),
        media: MediaSettingsSchema,
    }),
    /** Leave current room */
    LEAVE_ROOM: z.object({}),
    /** Mark ready */
    PLAYER_READY: z.object({}),
    /** Mark unready */
    PLAYER_UNREADY: z.object({}),
    /** Start game (host) */
    START_GAME: z.object({}),
    /** Submit game action */
    GAME_ACTION: z.object({
        seat: nonNegativeIntSchema,
        action: BaseActionSchema,
    }),
    /** Update room settings (host) */
    ROOM_SETTINGS_UPDATE: z.object({
        settings: RoomSettingsSchema.partial(),
    }),
    /** Join matchmaking queue */
    QUEUE_JOIN: z.object({
        game: z.enum([
            "ludo",
            "chess",
            "snake-ladder",
            "checkers",
            "uno",
            "tic-tac-toe",
        ]),
        botFill: z.boolean(),
        fillAfterMs: positiveIntSchema,
    }),
    /** Leave matchmaking queue */
    QUEUE_LEAVE: z.object({}),
    /** WebRTC offer */
    MEDIA_OFFER: z.object({
        to: uuidSchema,
        payload: z.object({ sdp: z.string() }),
    }),
    /** WebRTC answer */
    MEDIA_ANSWER: z.object({
        to: uuidSchema,
        payload: z.object({ sdp: z.string() }),
    }),
    /** WebRTC ICE candidate */
    MEDIA_ICE: z.object({
        to: uuidSchema,
        payload: z.object({ candidate: IceCandidateSchema }),
    }),
    /** Heartbeat ping */
    PING: z.object({}),
};

/**
 * Map of server message types to their payload validation schemas.
 * Used by validateServerMessage for type-safe payload validation.
 */
export const ServerPayloadSchemas: Record<ServerMessageType, z.ZodTypeAny> = {
    /** Auth success with player ID and session token */
    AUTH_OK: z.object({
        playerId: uuidSchema,
        token: z.string(),
    }),
    /** Auth failure with error code */
    AUTH_ERROR: z.object({
        code: z.nativeEnum(ErrorCode),
    }),
    /** Room created with invite code and snapshot */
    ROOM_CREATED: z.object({
        roomId: uuidSchema,
        inviteCode: z.string(),
        room: RoomSnapshotSchema,
    }),
    /** Room state updated */
    ROOM_UPDATE: z.object({
        room: RoomSnapshotSchema,
    }),
    /** Room status transition */
    ROOM_STATE_CHANGE: z.object({
        from: z.enum([
            "WAITING",
            "STARTING",
            "IN_PROGRESS",
            "FINISHED",
            "ARCHIVED",
        ]),
        to: z.enum([
            "WAITING",
            "STARTING",
            "IN_PROGRESS",
            "FINISHED",
            "ARCHIVED",
        ]),
    }),
    /** Player joined room */
    PLAYER_JOINED: z.object({
        seat: nonNegativeIntSchema,
        player: PlayerInfoSchema,
    }),
    /** Player left room */
    PLAYER_LEFT: z.object({
        seat: nonNegativeIntSchema,
        reason: z.enum(["left", "kicked"]),
    }),
    /** Player disconnected */
    PLAYER_DISCONNECTED: z.object({
        seat: nonNegativeIntSchema,
    }),
    /** Player reconnected */
    PLAYER_RECONNECTED: z.object({
        seat: nonNegativeIntSchema,
    }),
    /** Forfeit window started */
    FORFEIT_WINDOW: z.object({
        seat: nonNegativeIntSchema,
        forfeitAt: timestampSchema,
    }),
    /** Game started with initial state */
    GAME_START: z.object({
        seatOrder: z.array(nonNegativeIntSchema),
        config: MatchConfigSchema,
        initialState: GameStateSchema,
    }),
    /** Game state update */
    GAME_STATE: z.object({
        kind: z.enum(["snapshot", "delta"]),
        stateVersion: nonNegativeIntSchema,
        state: GameStateSchema,
    }),
    /** Game ended with result */
    GAME_END: z.object({
        result: MatchResultSchema,
        winner: uuidSchema.nullable(),
        reason: z.string(),
        stats: z.record(z.unknown()),
    }),
    /** Matchmaking found match */
    MATCH_FOUND: z.object({
        roomId: uuidSchema,
        inviteCode: z.string(),
    }),
    /** Request acknowledgment */
    ACK: z.object({
        requestId: uuidSchema,
        stateVersion: nonNegativeIntSchema,
    }),
    /** Generic error */
    ERROR: z.object({
        code: z.nativeEnum(ErrorCode),
        message: z.string(),
        requestId: uuidSchema.optional(),
    }),
    /** Heartbeat pong */
    PONG: z.object({}),
};