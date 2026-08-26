import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

export interface Envelope<T = unknown> {
    v: typeof PROTOCOL_VERSION;
    type: MessageType;
    requestId?: string;
    roomId?: string;
    payload: T;
}

export type MessageType = ClientMessageType | ServerMessageType;

export type ClientMessageType =
    | "AUTH"
    | "RESUME"
    | "CREATE_ROOM"
    | "JOIN_ROOM"
    | "LEAVE_ROOM"
    | "PLAYER_READY"
    | "PLAYER_UNREADY"
    | "START_GAME"
    | "GAME_ACTION"
    | "ROOM_SETTINGS_UPDATE"
    | "QUEUE_JOIN"
    | "QUEUE_LEAVE"
    | "MEDIA_OFFER"
    | "MEDIA_ANSWER"
    | "MEDIA_ICE"
    | "PING";

export type ServerMessageType =
    | "AUTH_OK"
    | "AUTH_ERROR"
    | "ROOM_CREATED"
    | "ROOM_UPDATE"
    | "ROOM_STATE_CHANGE"
    | "PLAYER_JOINED"
    | "PLAYER_LEFT"
    | "PLAYER_DISCONNECTED"
    | "PLAYER_RECONNECTED"
    | "FORFEIT_WINDOW"
    | "GAME_START"
    | "GAME_STATE"
    | "GAME_END"
    | "MATCH_FOUND"
    | "ACK"
    | "ERROR"
    | "PONG";

export const ErrorCode = {
    NOT_AUTHED: "NOT_AUTHED",
    ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
    ROOM_FULL: "ROOM_FULL",
    INVALID_ACTION: "INVALID_ACTION",
    NOT_YOUR_TURN: "NOT_YOUR_TURN",
    NOT_HOST: "NOT_HOST",
    GAME_ALREADY_STARTED: "GAME_ALREADY_STARTED",
    FORBIDDEN: "FORBIDDEN",
    BAD_REQUEST: "BAD_REQUEST",
    RATE_LIMITED: "RATE_LIMITED",
    SERVER_ERROR: "SERVER_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorPayload {
    code: ErrorCode;
    message: string;
}

export interface AuthPayload {
    token: string;
}

export interface AuthOkPayload {
    playerId: string;
    token: string;
}

export interface AuthErrorPayload {
    code: ErrorCode;
}

export interface ResumePayload {
    roomId: string;
    lastStateVersion: number;
    lastSeq?: number;
}

export interface CreateRoomPayload {
    game: GameType;
    maxPlayers: number;
    private: boolean;
    settings: RoomSettings;
}

export interface JoinRoomPayload {
    inviteCode: string;
    media: MediaSettings;
}

export interface LeaveRoomPayload {}

export interface PlayerReadyPayload {}

export interface PlayerUnreadyPayload {}

export interface StartGamePayload {}

export interface GameActionPayload {
    seat: number;
    action: EngineAction;
}

export interface RoomSettingsUpdatePayload {
    settings: Partial<RoomSettings>;
}

export interface QueueJoinPayload {
    game: GameType;
    botFill: boolean;
    fillAfterMs: number;
}

export interface QueueLeavePayload {}

export interface MediaOfferPayload {
    to: string;
    payload: { sdp: string };
}

export interface MediaAnswerPayload {
    to: string;
    payload: { sdp: string };
}

export interface IceCandidateInit {
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
    usernameFragment?: string;
}

export interface MediaIcePayload {
    to: string;
    payload: { candidate: IceCandidateInit };
}

export interface PingPayload {}

export interface RoomCreatedPayload {
    roomId: string;
    inviteCode: string;
    room: RoomSnapshot;
}

export interface RoomUpdatePayload {
    room: RoomSnapshot;
}

export interface RoomStateChangePayload {
    from: RoomStatus;
    to: RoomStatus;
}

export interface PlayerJoinedPayload {
    seat: number;
    player: PlayerInfo;
}

export interface PlayerLeftPayload {
    seat: number;
    reason: "left" | "kicked";
}

export interface PlayerDisconnectedPayload {
    seat: number;
}

export interface PlayerReconnectedPayload {
    seat: number;
}

export interface ForfeitWindowPayload {
    seat: number;
    forfeitAt: string;
}

export interface GameStartPayload {
    seatOrder: number[];
    config: MatchConfig;
    initialState: GameState;
}

export interface GameStatePayload {
    kind: "snapshot" | "delta";
    stateVersion: number;
    state: GameState;
}

export interface GameEndPayload {
    result: MatchResult;
    winner: string | null;
    reason: GameEndReason;
    stats: Record<string, unknown>;
}

export interface MatchFoundPayload {
    roomId: string;
    inviteCode: string;
}

export interface AckPayload {
    requestId: string;
    stateVersion: number;
}

export interface PongPayload {}

export type GameType =
    | "ludo"
    | "chess"
    | "snake-ladder"
    | "checkers"
    | "uno"
    | "tic-tac-toe";

export type RoomStatus =
    | "WAITING"
    | "STARTING"
    | "IN_PROGRESS"
    | "FINISHED"
    | "ARCHIVED";

export type ParticipantStatus =
    | "ACTIVE"
    | "LEFT"
    | "KICKED"
    | "DISCONNECTED"
    | "FORFEITED";

export type MatchStatus = "IN_PROGRESS" | "FINISHED" | "ARCHIVED";

export type GameEndReason =
    | "checkmate"
    | "timeout"
    | "forfeit"
    | "completed"
    | "draw"
    | "forfeit_all"
    | string;

export interface RoomSettings {
    media: MediaSettings;
    maxPlayers: number;
    private: boolean;
}

export interface MediaSettings {
    voice: boolean;
    video: boolean;
}

export interface RoomSnapshot {
    id: string;
    name: string;
    gameType: GameType;
    maxPlayers: number;
    status: RoomStatus;
    settings: RoomSettings;
    hostId: string;
    seats: SeatInfo[];
    createdAt: string;
    startedAt?: string;
    endedAt?: string;
}

export interface SeatInfo {
    seat: number;
    playerId: string | null;
    player?: PlayerInfo | null;
    bot: boolean;
    status: ParticipantStatus;
    ready: boolean;
    score: number;
}

export interface PlayerInfo {
    id: string;
    username: string;
    displayName: string;
    avatar?: string;
    isGuest: boolean;
}

export interface MatchConfig {
    maxPlayers: number;
    media: MediaSettings;
    private: boolean;
}

export interface MatchResult {
    winner: string | null;
    reason: GameEndReason;
    dnf: string[];
}

export interface GameState {
    [key: string]: unknown;
}

export interface EngineAction {
    type: string;
    [key: string]: unknown;
}

export interface SeatAction {
    seat: number;
    action: EngineAction;
}

export interface LudoAction extends EngineAction {
    type: "ROLL_DICE" | "MOVE_TOKEN";
    token?: number;
    from?: number;
    to?: number;
}

export interface ChessAction extends EngineAction {
    type: "MOVE";
    from: string;
    to: string;
    promotion?: "q" | "r" | "b" | "n";
}

export interface LudoEvent {
    type:
        | "dice"
        | "move"
        | "captured"
        | "born"
        | "ascend"
        | "turn_start"
        | "turn_end";
    value?: number;
    token?: number;
    from?: number;
    to?: number;
    backTo?: string;
    seat?: number;
}

export interface ChessEvent {
    type: "move";
    from: string;
    to: string;
    piece: string;
    captured?: string;
    promotion?: string;
    check?: boolean;
    checkmate?: boolean;
    seat: number;
}

export type GameEvent = LudoEvent | ChessEvent | Record<string, unknown>;

export interface RoomLifecycle {
    WAITING: "WAITING";
    STARTING: "STARTING";
    IN_PROGRESS: "IN_PROGRESS";
    FINISHED: "FINISHED";
    ARCHIVED: "ARCHIVED";
}

export const RoomLifecycle: RoomLifecycle = {
    WAITING: "WAITING",
    STARTING: "STARTING",
    IN_PROGRESS: "IN_PROGRESS",
    FINISHED: "FINISHED",
    ARCHIVED: "ARCHIVED",
};

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const positiveIntSchema = z.number().int().positive();
const nonNegativeIntSchema = z.number().int().nonnegative();

export const MediaSettingsSchema = z.object({
    voice: z.boolean(),
    video: z.boolean(),
});

export const RoomSettingsSchema = z.object({
    media: MediaSettingsSchema,
    maxPlayers: positiveIntSchema.max(8),
    private: z.boolean(),
});

export const PlayerInfoSchema = z.object({
    id: uuidSchema,
    username: z.string().min(1).max(32),
    displayName: z.string().min(1).max(64),
    avatar: z.string().url().optional(),
    isGuest: z.boolean(),
});

export const SeatInfoSchema = z.object({
    seat: nonNegativeIntSchema,
    playerId: uuidSchema.nullable(),
    player: PlayerInfoSchema.nullable().optional(),
    bot: z.boolean(),
    status: z.enum(["ACTIVE", "LEFT", "KICKED", "DISCONNECTED", "FORFEITED"]),
    ready: z.boolean(),
    score: nonNegativeIntSchema,
});

export const RoomSnapshotSchema = z.object({
    id: uuidSchema,
    name: z.string().min(1).max(128),
    gameType: z.enum([
        "ludo",
        "chess",
        "snake-ladder",
        "checkers",
        "uno",
        "tic-tac-toe",
    ]),
    maxPlayers: positiveIntSchema.max(8),
    status: z.enum([
        "WAITING",
        "STARTING",
        "IN_PROGRESS",
        "FINISHED",
        "ARCHIVED",
    ]),
    settings: RoomSettingsSchema,
    hostId: uuidSchema,
    seats: z.array(SeatInfoSchema),
    createdAt: timestampSchema,
    startedAt: timestampSchema.optional(),
    endedAt: timestampSchema.optional(),
});

export const MatchConfigSchema = z.object({
    maxPlayers: positiveIntSchema.max(8),
    media: MediaSettingsSchema,
    private: z.boolean(),
});

export const MatchResultSchema = z.object({
    winner: uuidSchema.nullable(),
    reason: z.string(),
    dnf: z.array(uuidSchema),
});

const BaseActionSchema = z
    .object({
        type: z.string(),
    })
    .passthrough();

export const LudoActionSchema = BaseActionSchema.extend({
    type: z.enum(["ROLL_DICE", "MOVE_TOKEN"]),
    token: z.number().int().optional(),
    from: z.number().int().optional(),
    to: z.number().int().optional(),
});

export const ChessActionSchema = BaseActionSchema.extend({
    type: z.literal("MOVE"),
    from: z.string().regex(/^[a-h][1-8]$/),
    to: z.string().regex(/^[a-h][1-8]$/),
    promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

export const LudoEventSchema = z.object({
    type: z.enum([
        "dice",
        "move",
        "captured",
        "born",
        "ascend",
        "turn_start",
        "turn_end",
    ]),
    value: z.number().int().optional(),
    token: z.number().int().optional(),
    from: z.number().int().optional(),
    to: z.number().int().optional(),
    backTo: z.string().optional(),
    seat: z.number().int().optional(),
});

export const ChessEventSchema = z.object({
    type: z.literal("move"),
    from: z.string().regex(/^[a-h][1-8]$/),
    to: z.string().regex(/^[a-h][1-8]$/),
    piece: z.string(),
    captured: z.string().optional(),
    promotion: z.string().optional(),
    check: z.boolean().optional(),
    checkmate: z.boolean().optional(),
    seat: z.number().int(),
});

export const GameEventSchema = z.union([
    LudoEventSchema,
    ChessEventSchema,
    z.record(z.unknown()),
]);

export const GameStateSchema = z.record(z.unknown());

export const EnvelopeSchema = z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.string(),
    requestId: uuidSchema.optional(),
    roomId: uuidSchema.optional(),
    payload: z.unknown(),
});

const IceCandidateSchema = z.object({
    candidate: z.string(),
    sdpMid: z.string().optional(),
    sdpMLineIndex: z.number().int().optional(),
    usernameFragment: z.string().optional(),
});

export const ClientPayloadSchemas: Record<ClientMessageType, z.ZodTypeAny> = {
    AUTH: z.object({ token: z.string().min(1) }),
    RESUME: z.object({
        roomId: uuidSchema,
        lastStateVersion: nonNegativeIntSchema,
        lastSeq: nonNegativeIntSchema.optional(),
    }),
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
    JOIN_ROOM: z.object({
        inviteCode: z.string().min(1),
        media: MediaSettingsSchema,
    }),
    LEAVE_ROOM: z.object({}),
    PLAYER_READY: z.object({}),
    PLAYER_UNREADY: z.object({}),
    START_GAME: z.object({}),
    GAME_ACTION: z.object({
        seat: nonNegativeIntSchema,
        action: BaseActionSchema,
    }),
    ROOM_SETTINGS_UPDATE: z.object({
        settings: RoomSettingsSchema.partial(),
    }),
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
    QUEUE_LEAVE: z.object({}),
    MEDIA_OFFER: z.object({
        to: uuidSchema,
        payload: z.object({ sdp: z.string() }),
    }),
    MEDIA_ANSWER: z.object({
        to: uuidSchema,
        payload: z.object({ sdp: z.string() }),
    }),
    MEDIA_ICE: z.object({
        to: uuidSchema,
        payload: z.object({ candidate: IceCandidateSchema }),
    }),
    PING: z.object({}),
};

export const ServerPayloadSchemas: Record<ServerMessageType, z.ZodTypeAny> = {
    AUTH_OK: z.object({
        playerId: uuidSchema,
        token: z.string(),
    }),
    AUTH_ERROR: z.object({
        code: z.nativeEnum(ErrorCode),
    }),
    ROOM_CREATED: z.object({
        roomId: uuidSchema,
        inviteCode: z.string(),
        room: RoomSnapshotSchema,
    }),
    ROOM_UPDATE: z.object({
        room: RoomSnapshotSchema,
    }),
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
    PLAYER_JOINED: z.object({
        seat: nonNegativeIntSchema,
        player: PlayerInfoSchema,
    }),
    PLAYER_LEFT: z.object({
        seat: nonNegativeIntSchema,
        reason: z.enum(["left", "kicked"]),
    }),
    PLAYER_DISCONNECTED: z.object({
        seat: nonNegativeIntSchema,
    }),
    PLAYER_RECONNECTED: z.object({
        seat: nonNegativeIntSchema,
    }),
    FORFEIT_WINDOW: z.object({
        seat: nonNegativeIntSchema,
        forfeitAt: timestampSchema,
    }),
    GAME_START: z.object({
        seatOrder: z.array(nonNegativeIntSchema),
        config: MatchConfigSchema,
        initialState: GameStateSchema,
    }),
    GAME_STATE: z.object({
        kind: z.enum(["snapshot", "delta"]),
        stateVersion: nonNegativeIntSchema,
        state: GameStateSchema,
    }),
    GAME_END: z.object({
        result: MatchResultSchema,
        winner: uuidSchema.nullable(),
        reason: z.string(),
        stats: z.record(z.unknown()),
    }),
    MATCH_FOUND: z.object({
        roomId: uuidSchema,
        inviteCode: z.string(),
    }),
    ACK: z.object({
        requestId: uuidSchema,
        stateVersion: nonNegativeIntSchema,
    }),
    ERROR: z.object({
        code: z.nativeEnum(ErrorCode),
        message: z.string(),
        requestId: uuidSchema.optional(),
    }),
    PONG: z.object({}),
};

export function createEnvelope<T>(
    type: MessageType,
    payload: T,
    options?: { requestId?: string; roomId?: string },
): Envelope<T> {
    return {
        v: PROTOCOL_VERSION,
        type,
        payload,
        ...options,
    };
}

export function isClientMessage(type: MessageType): type is ClientMessageType {
    return [
        "AUTH",
        "RESUME",
        "CREATE_ROOM",
        "JOIN_ROOM",
        "LEAVE_ROOM",
        "PLAYER_READY",
        "PLAYER_UNREADY",
        "START_GAME",
        "GAME_ACTION",
        "ROOM_SETTINGS_UPDATE",
        "QUEUE_JOIN",
        "QUEUE_LEAVE",
        "MEDIA_OFFER",
        "MEDIA_ANSWER",
        "MEDIA_ICE",
        "PING",
    ].includes(type);
}

export function isServerMessage(type: MessageType): type is ServerMessageType {
    return [
        "AUTH_OK",
        "AUTH_ERROR",
        "ROOM_CREATED",
        "ROOM_UPDATE",
        "ROOM_STATE_CHANGE",
        "PLAYER_JOINED",
        "PLAYER_LEFT",
        "PLAYER_DISCONNECTED",
        "PLAYER_RECONNECTED",
        "FORFEIT_WINDOW",
        "GAME_START",
        "GAME_STATE",
        "GAME_END",
        "MATCH_FOUND",
        "ACK",
        "ERROR",
        "PONG",
    ].includes(type);
}

export function requiresRequestId(type: ClientMessageType): boolean {
    return !["PING"].includes(type);
}

export function parseEnvelope(data: unknown): Envelope {
    return EnvelopeSchema.parse(data) as Envelope;
}

export function validateClientMessage<T extends ClientMessageType>(
    type: T,
    payload: unknown,
): z.infer<(typeof ClientPayloadSchemas)[T]> {
    const schema = ClientPayloadSchemas[type];
    if (!schema) {
        throw new Error(`No schema for client message type: ${type}`);
    }
    return schema.parse(payload);
}

export function validateServerMessage<T extends ServerMessageType>(
    type: T,
    payload: unknown,
): z.infer<(typeof ServerPayloadSchemas)[T]> {
    const schema = ServerPayloadSchemas[type];
    if (!schema) {
        throw new Error(`No schema for server message type: ${type}`);
    }
    return schema.parse(payload);
}

export function validateEnvelope(envelope: Envelope): Envelope {
    const parsed = EnvelopeSchema.parse(envelope) as Envelope;
    if (isClientMessage(parsed.type)) {
        validateClientMessage(parsed.type, parsed.payload);
    } else if (isServerMessage(parsed.type)) {
        validateServerMessage(parsed.type, parsed.payload);
    }
    return parsed;
}
