import { z } from "zod";

import {
    PROTOCOL_VERSION,
    type Envelope,
    type MessageType,
    type ClientMessageType,
    type ServerMessageType,
} from "./types";

import {
    EnvelopeSchema,
    ClientPayloadSchemas,
    ServerPayloadSchemas,
} from "./schemas";

/** Ordered list of all client message types for type guard */
const CLIENT_MESSAGE_TYPES: readonly ClientMessageType[] = [
    "AUTH",
    "RESUME",
    "CREATE_ROOM",
    "JOIN_ROOM",
    "LEAVE_ROOM",
    "PLAYER_READY",
    "PLAYER_UNREADY",
    "START_GAME",
    "GAME_ACTION",
    "REQUEST_STATE",
    "LIST_ROOMS",
    "ROOM_SETTINGS_UPDATE",
    "QUEUE_JOIN",
    "QUEUE_LEAVE",
    "MEDIA_OFFER",
    "MEDIA_ANSWER",
    "MEDIA_ICE",
    "PING",
] as const;

/** Ordered list of all server message types for type guard */
const SERVER_MESSAGE_TYPES: readonly ServerMessageType[] = [
    "AUTH_OK",
    "AUTH_ERROR",
    "ROOM_CREATED",
    "ROOM_JOINED",
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
    "ROOM_INFO",
    "ROOM_LIST",
    "PONG",
] as const;

/**
 * Creates a protocol envelope with the current protocol version.
 *
 * @param type - Message type discriminator
 * @param payload - Message payload
 * @param options - Optional requestId for correlation, roomId for routing
 * @returns Properly formatted envelope
 *
 * @example
 * ```ts
 * const envelope = createEnvelope("AUTH", { token: "abc123" }, { requestId: "req-1" });
 * ```
 */
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

/**
 * Type guard to check if a message type is a client-to-server message.
 *
 * @param type - Message type to check
 * @returns True if type is a ClientMessageType
 */
export function isClientMessage(type: MessageType): type is ClientMessageType {
    return CLIENT_MESSAGE_TYPES.includes(type as ClientMessageType);
}

/**
 * Type guard to check if a message type is a server-to-client message.
 *
 * @param type - Message type to check
 * @returns True if type is a ServerMessageType
 */
export function isServerMessage(type: MessageType): type is ServerMessageType {
    return SERVER_MESSAGE_TYPES.includes(type as ServerMessageType);
}

/**
 * Determines if a client message type requires a requestId.
 * All client messages except PING require a requestId for acknowledgment tracking.
 *
 * @param type - Client message type
 * @returns True if requestId is required
 */
export function requiresRequestId(type: ClientMessageType): boolean {
    return type !== "PING";
}

/**
 * Parses and validates a raw envelope from unknown data.
 * Validates envelope structure only - payload is validated separately by type.
 *
 * @param data - Raw data to parse
 * @returns Validated envelope
 * @throws ZodError if envelope structure is invalid
 */
export function parseEnvelope(data: unknown): Envelope {
    return EnvelopeSchema.parse(data) as Envelope;
}

/**
 * Validates a client message payload against its schema.
 *
 * @param type - Client message type (used to select schema)
 * @param payload - Raw payload to validate
 * @returns Validated and typed payload
 * @throws Error if no schema exists for type
 * @throws ZodError if payload fails validation
 */
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

/**
 * Validates a server message payload against its schema.
 *
 * @param type - Server message type (used to select schema)
 * @param payload - Raw payload to validate
 * @returns Validated and typed payload
 * @throws Error if no schema exists for type
 * @throws ZodError if payload fails validation
 */
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

/**
 * Fully validates an envelope including its payload.
 * Validates envelope structure, then delegates to type-specific payload validation.
 *
 * @param envelope - Envelope to validate
 * @returns Fully validated envelope
 * @throws ZodError if envelope or payload is invalid
 */
export function validateEnvelope(envelope: Envelope): Envelope {
    const parsed = EnvelopeSchema.parse(envelope) as Envelope;
    if (isClientMessage(parsed.type)) {
        validateClientMessage(parsed.type, parsed.payload);
    } else if (isServerMessage(parsed.type)) {
        validateServerMessage(parsed.type, parsed.payload);
    }
    return parsed;
}
