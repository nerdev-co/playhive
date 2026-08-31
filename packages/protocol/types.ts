/**
 * Protocol version constant. Increment when breaking changes are made to message formats.
 */
export const PROTOCOL_VERSION = 1 as const;

/**
 * Base envelope wrapper for all protocol messages.
 * Every message sent over the wire is wrapped in an Envelope.
 *
 * @typeParam T - The payload type for this specific message
 */
export interface Envelope<T = unknown> {
    /** Protocol version for compatibility checking */
    v: typeof PROTOCOL_VERSION;
    /** Discriminated union of all possible message types */
    type: MessageType;
    /** Optional request ID for request-response correlation */
    requestId?: string;
    /** Optional room ID for room-scoped messages */
    roomId?: string;
    /** The actual message payload */
    payload: T;
}

/** Union of all message types (both client-to-server and server-to-client) */
export type MessageType = ClientMessageType | ServerMessageType;

/**
 * Messages sent from client to server.
 *
 * @category Client Messages
 */
export type ClientMessageType =
    /** Authenticate with the server using a token */
    | "AUTH"
    /** Resume a previous session in a room */
    | "RESUME"
    /** Create a new game room */
    | "CREATE_ROOM"
    /** Join an existing room via invite code */
    | "JOIN_ROOM"
    /** Leave the current room */
    | "LEAVE_ROOM"
    /** Mark player as ready to start */
    | "PLAYER_READY"
    /** Mark player as not ready */
    | "PLAYER_UNREADY"
    /** Request game start (host only) */
    | "START_GAME"
    /** Submit a game action during play */
    | "GAME_ACTION"
    /** Request current game state snapshot */
    | "REQUEST_STATE"
    /** List public waiting rooms */
    | "LIST_ROOMS"
    /** Update room settings (host only) */
    | "ROOM_SETTINGS_UPDATE"
    /** Join matchmaking queue */
    | "QUEUE_JOIN"
    /** Leave matchmaking queue */
    | "QUEUE_LEAVE"
    /** WebRTC offer for media connection */
    | "MEDIA_OFFER"
    /** WebRTC answer for media connection */
    | "MEDIA_ANSWER"
    /** WebRTC ICE candidate for media connection */
    | "MEDIA_ICE"
    /** Heartbeat ping */
    | "PING";

/**
 * Messages sent from server to client.
 *
 * @category Server Messages
 */
export type ServerMessageType =
    /** Authentication successful */
    | "AUTH_OK"
    /** Authentication failed */
    | "AUTH_ERROR"
    /** Room was created successfully */
    | "ROOM_CREATED"
    /** Successfully joined a room */
    | "ROOM_JOINED"
    /** Room state updated */
    | "ROOM_UPDATE"
    /** Room status changed */
    | "ROOM_STATE_CHANGE"
    /** New player joined the room */
    | "PLAYER_JOINED"
    /** Player left the room */
    | "PLAYER_LEFT"
    /** Player disconnected */
    | "PLAYER_DISCONNECTED"
    /** Player reconnected */
    | "PLAYER_RECONNECTED"
    /** Forfeit window started for a player */
    | "FORFEIT_WINDOW"
    /** Game has started */
    | "GAME_START"
    /** Game state update (snapshot or delta) */
    | "GAME_STATE"
    /** Game has ended */
    | "GAME_END"
    /** Matchmaking found a match */
    | "MATCH_FOUND"
    /** Acknowledgment for a client request */
    | "ACK"
    /** Generic error response */
    | "ERROR"
    /** Room info (gameType, status) for pre-game state */
    | "ROOM_INFO"
    /** List of public rooms */
    | "ROOM_LIST"
    /** Heartbeat pong */
    | "PONG";

/**
 * Standardized error codes used across the protocol.
 *
 * @category Errors
 */
export const ErrorCode = {
    /** Client is not authenticated */
    NOT_AUTHED: "NOT_AUTHED",
    /** Requested room does not exist */
    ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
    /** Room has reached maximum capacity */
    ROOM_FULL: "ROOM_FULL",
    /** Action is invalid in current state */
    INVALID_ACTION: "INVALID_ACTION",
    /** Not the player's turn */
    NOT_YOUR_TURN: "NOT_YOUR_TURN",
    /** Operation requires host privileges */
    NOT_HOST: "NOT_HOST",
    /** Game has already started */
    GAME_ALREADY_STARTED: "GAME_ALREADY_STARTED",
    /** Operation is forbidden */
    FORBIDDEN: "FORBIDDEN",
    /** Malformed or invalid request */
    BAD_REQUEST: "BAD_REQUEST",
    /** Too many requests */
    RATE_LIMITED: "RATE_LIMITED",
    /** Internal server error */
    SERVER_ERROR: "SERVER_ERROR",
} as const;

/** Type derived from ErrorCode enum values */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Standard error payload structure */
export interface ErrorPayload {
    /** Machine-readable error code */
    code: ErrorCode;
    /** Human-readable error message */
    message: string;
}

/** Payload for AUTH message */
export interface AuthPayload {
    /** Authentication token */
    token: string;
}

/** Payload for AUTH_OK message */
export interface AuthOkPayload {
    /** Unique player identifier */
    playerId: string;
    /** Session token for subsequent requests */
    token: string;
}

/** Payload for AUTH_ERROR message */
export interface AuthErrorPayload {
    /** Error code explaining why auth failed */
    code: ErrorCode;
}

/** Payload for RESUME message */
export interface ResumePayload {
    /** Room to resume */
    roomId: string;
    /** Last known state version */
    lastStateVersion: number;
    /** Last acknowledged sequence number */
    lastSeq?: number;
}

/** Payload for CREATE_ROOM message */
export interface CreateRoomPayload {
    /** Type of game to play */
    game: GameType;
    /** Maximum number of players */
    maxPlayers: number;
    /** Whether room is private (invite-only) */
    private: boolean;
    /** Room configuration settings */
    settings: RoomSettings;
}

/** Payload for JOIN_ROOM message */
export interface JoinRoomPayload {
    /** Room code to join */
    roomId: string;
    /** Media preferences for this session */
    media: MediaSettings;
}

/** Payload for LEAVE_ROOM message (empty) */
export interface LeaveRoomPayload {}

/** Payload for PLAYER_READY message (empty) */
export interface PlayerReadyPayload {}

/** Payload for PLAYER_UNREADY message (empty) */
export interface PlayerUnreadyPayload {}

/** Payload for START_GAME message (empty) */
export interface StartGamePayload {}

/** Payload for ROOM_INFO message (enriched for waiting room UI) */
export interface RoomInfoPayload {
    /** Game type for this room */
    gameType: GameType;
    /** Current room status */
    status: RoomStatus;
    /** Room display name */
    name: string;
    /** Room host player ID */
    hostId: string;
    /** Seat assignments and player info */
    seats: SeatInfo[];
    /** Maximum players allowed */
    maxPlayers: number;
}

/** Payload for GAME_ACTION message */
export interface GameActionPayload {
    /** Seat index of the acting player */
    seat: number;
    /** The game-specific action */
    action: EngineAction;
}

/** Payload for ROOM_SETTINGS_UPDATE message */
export interface RoomSettingsUpdatePayload {
    /** Partial settings to update */
    settings: Partial<RoomSettings>;
}

/** Payload for QUEUE_JOIN message */
export interface QueueJoinPayload {
    /** Game type to queue for */
    game: GameType;
    /** Whether to fill with bots */
    botFill: boolean;
    /** Milliseconds before bot fill activates */
    fillAfterMs: number;
}

/** Payload for QUEUE_LEAVE message (empty) */
export interface QueueLeavePayload {}

/** Payload for MEDIA_OFFER message */
export interface MediaOfferPayload {
    /** Target player ID */
    to: string;
    /** SDP offer */
    payload: { sdp: string };
}

/** Payload for MEDIA_ANSWER message */
export interface MediaAnswerPayload {
    /** Target player ID */
    to: string;
    /** SDP answer */
    payload: { sdp: string };
}

/** WebRTC ICE candidate initialization */
export interface IceCandidateInit {
    /** ICE candidate string */
    candidate: string;
    /** SDP media stream identification */
    sdpMid?: string;
    /** SDP media line index */
    sdpMLineIndex?: number;
    /** Username fragment for ICE */
    usernameFragment?: string;
}

/** Payload for MEDIA_ICE message */
export interface MediaIcePayload {
    /** Target player ID */
    to: string;
    /** ICE candidate */
    payload: { candidate: IceCandidateInit };
}

/** Payload for PING message (empty) */
export interface PingPayload {}

/** Payload for ROOM_CREATED message */
export interface RoomCreatedPayload {
    /** Unique room identifier */
    roomId: string;
    /** Full room snapshot */
    room: RoomSnapshot;
}

/** Payload for ROOM_UPDATE message */
export interface RoomUpdatePayload {
    /** Updated room snapshot */
    room: RoomSnapshot;
}

/** Payload for ROOM_STATE_CHANGE message */
export interface RoomStateChangePayload {
    /** Previous room status */
    from: RoomStatus;
    /** New room status */
    to: RoomStatus;
}

/** Payload for PLAYER_JOINED message */
export interface PlayerJoinedPayload {
    /** Seat index assigned to player */
    seat: number;
    /** Player information */
    player: PlayerInfo;
}

/** Payload for PLAYER_LEFT message */
export interface PlayerLeftPayload {
    /** Seat index of departing player */
    seat: number;
    /** Reason for leaving */
    reason: "left" | "kicked";
}

/** Payload for PLAYER_DISCONNECTED message */
export interface PlayerDisconnectedPayload {
    /** Seat index of disconnected player */
    seat: number;
}

/** Payload for PLAYER_RECONNECTED message */
export interface PlayerReconnectedPayload {
    /** Seat index of reconnected player */
    seat: number;
}

/** Payload for FORFEIT_WINDOW message */
export interface ForfeitWindowPayload {
    /** Seat index of player facing forfeit */
    seat: number;
    /** ISO timestamp when forfeit will occur */
    forfeitAt: string;
}

/** Payload for GAME_START message */
export interface GameStartPayload {
    /** Seat order for turn sequence */
    seatOrder: number[];
    /** Match configuration */
    config: MatchConfig;
    /** Initial game state */
    initialState: GameState;
}

/** Payload for GAME_STATE message */
export interface GameStatePayload {
    /** Whether this is a full snapshot or incremental delta */
    kind: "snapshot" | "delta";
    /** Monotonically increasing state version */
    stateVersion: number;
    /** Game state data */
    state: GameState;
}

/** Payload for GAME_END message */
export interface GameEndPayload {
    /** Match result details */
    result: MatchResult;
    /** Winner player ID or null for draw */
    winner: string | null;
    /** Reason for game end */
    reason: GameEndReason;
    /** Additional game statistics */
    stats: Record<string, unknown>;
}

/** Payload for MATCH_FOUND message */
export interface MatchFoundPayload {
    /** Created room ID */
    roomId: string;
}

/** Payload for ACK message */
export interface AckPayload {
    /** Original request ID */
    requestId: string;
    /** State version at time of acknowledgment */
    stateVersion: number;
}

/** Payload for PONG message (empty) */
export interface PongPayload {}

/**
 * Supported game types.
 *
 * @category Game Types
 */
export type GameType =
    | "ludo"
    | "chess"
    | "snake-ladder"
    | "checkers"
    | "uno"
    | "tic-tac-toe";

/**
 * Possible room lifecycle states.
 *
 * @category Room State
 */
export type RoomStatus =
    /** Room is waiting for players */
    | "WAITING"
    /** Room is transitioning to in-progress */
    | "STARTING"
    /** Game is actively being played */
    | "IN_PROGRESS"
    /** Game has finished */
    | "FINISHED"
    /** Room is archived (read-only) */
    | "ARCHIVED";

/**
 * Participant status within a room.
 *
 * @category Room State
 */
export type ParticipantStatus =
    /** Active and connected */
    | "ACTIVE"
    /** Voluntarily left */
    | "LEFT"
    /** Kicked by host */
    | "KICKED"
    /** Disconnected (may reconnect) */
    | "DISCONNECTED"
    /** Forfeited due to timeout */
    | "FORFEITED";

/** Match status (simplified room status for match context) */
export type MatchStatus = "IN_PROGRESS" | "FINISHED" | "ARCHIVED";

/**
 * Reasons why a game can end.
 *
 * @category Game End
 */
export type GameEndReason =
    /** Chess: checkmate */
    | "checkmate"
    /** Turn/connection timeout */
    | "timeout"
    /** Player forfeited */
    | "forfeit"
    /** Natural completion */
    | "completed"
    /** Draw/stalemate */
    | "draw"
    /** All players forfeited */
    | "forfeit_all"
    /** Extensible for game-specific reasons */
    | string;

/** Room configuration settings */
export interface RoomSettings {
    /** Media settings for the room */
    media: MediaSettings;
    /** Maximum players allowed */
    maxPlayers: number;
    /** Whether room is private */
    private: boolean;
}

/** Media capabilities/settings */
export interface MediaSettings {
    /** Voice chat enabled */
    voice: boolean;
    /** Video chat enabled */
    video: boolean;
}

/**
 * Complete room state snapshot.
 *
 * @category Room State
 */
export interface RoomSnapshot {
    /** Unique room identifier (5-char code) */
    id: string;
    /** Room display name */
    name: string;
    /** Game type being played */
    gameType: GameType;
    /** Maximum players */
    maxPlayers: number;
    /** Current room status */
    status: RoomStatus;
    /** Room settings */
    settings: RoomSettings;
    /** Host player ID */
    hostId: string;
    /** Seat assignments and player info */
    seats: SeatInfo[];
    /** Creation timestamp (ISO 8601) */
    createdAt: string;
    /** Game start timestamp (ISO 8601) */
    startedAt?: string;
    /** Game end timestamp (ISO 8601) */
    endedAt?: string;
}

/** Information about a seat in the room */
export interface SeatInfo {
    /** Seat index (0-based) */
    seat: number;
    /** Player ID occupying seat, or null if empty */
    playerId: string | null;
    /** Full player info (optional, for snapshots) */
    player?: PlayerInfo | null;
    /** Whether this seat is a bot */
    bot: boolean;
    /** Participant status */
    status: ParticipantStatus;
    /** Ready state */
    ready: boolean;
    /** Current score */
    score: number;
}

/** Player profile information */
export interface PlayerInfo {
    /** Unique player identifier (UUID) */
    id: string;
    /** Unique username */
    username: string;
    /** Display name */
    displayName: string;
    /** Optional avatar URL */
    avatar?: string;
    /** Whether this is a guest account */
    isGuest: boolean;
}

/** Match configuration at game start */
export interface MatchConfig {
    /** Maximum players in match */
    maxPlayers: number;
    /** Media settings for match */
    media: MediaSettings;
    /** Whether match is private */
    private: boolean;
}

/** Final match result */
export interface MatchResult {
    /** Winner player ID or null */
    winner: string | null;
    /** Reason for game end */
    reason: GameEndReason;
    /** Players who did not finish */
    dnf: string[];
}

/** Opaque game state - structure defined by game engine */
export interface GameState {
    [key: string]: unknown;
}

/** Base game engine action */
export interface EngineAction {
    /** Action type discriminator */
    type: string;
    /** Additional action-specific fields */
    [key: string]: unknown;
}

/** Seat + action combination for server processing */
export interface SeatAction {
    /** Seat index */
    seat: number;
    /** Engine action */
    action: EngineAction;
}

/** Ludo-specific actions */
export interface LudoAction extends EngineAction {
    type: "ROLL_DICE" | "MOVE_TOKEN";
    /** Token index being moved */
    token?: number;
    /** Starting position */
    from?: number;
    /** Destination position */
    to?: number;
}

/** Chess-specific actions */
export interface ChessAction extends EngineAction {
    type: "MOVE";
    /** Source square (algebraic notation) */
    from: string;
    /** Destination square (algebraic notation) */
    to: string;
    /** Promotion piece if applicable */
    promotion?: "q" | "r" | "b" | "n";
}

/** Ludo game events */
export interface LudoEvent {
    /** Event type */
    type:
        | "dice"
        | "move"
        | "captured"
        | "born"
        | "ascend"
        | "turn_start"
        | "turn_end";
    /** Dice value */
    value?: number;
    /** Token index */
    token?: number;
    /** Source position */
    from?: number;
    /** Destination position */
    to?: number;
    /** Return position for captured tokens */
    backTo?: string;
    /** Seat that triggered event */
    seat?: number;
}

/** Chess game events */
export interface ChessEvent {
    type: "move";
    /** Source square */
    from: string;
    /** Destination square */
    to: string;
    /** Piece moved */
    piece: string;
    /** Captured piece if any */
    captured?: string;
    /** Promotion piece if any */
    promotion?: string;
    /** Whether move gives check */
    check?: boolean;
    /** Whether move is checkmate */
    checkmate?: boolean;
    /** Seat that made the move */
    seat: number;
}

/** Union of all game events */
export type GameEvent = LudoEvent | ChessEvent | Record<string, unknown>;

/** Room lifecycle constants for easy comparison */
export interface RoomLifecycle {
    WAITING: "WAITING";
    STARTING: "STARTING";
    IN_PROGRESS: "IN_PROGRESS";
    FINISHED: "FINISHED";
    ARCHIVED: "ARCHIVED";
}

/** Room lifecycle constant values */
export const RoomLifecycle: RoomLifecycle = {
    WAITING: "WAITING",
    STARTING: "STARTING",
    IN_PROGRESS: "IN_PROGRESS",
    FINISHED: "FINISHED",
    ARCHIVED: "ARCHIVED",
};