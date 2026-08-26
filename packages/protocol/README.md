# @repo/protocol

**Single source of truth for the Playhive WebSocket protocol.**

Every message that travels over the WebSocket connection is defined here — both TypeScript types and runtime Zod validators. The gateway (`apps/ws-gateway`), HTTP server (`apps/server`), and web client (`apps/web`) all import from this package so the wire format cannot drift.

---

## What It Contains

| Category | Exports |
|----------|---------|
| **Envelope** | `Envelope<T>`, `createEnvelope()`, `parseEnvelope()`, `validateEnvelope()` |
| **Message Types** | `ClientMessageType` (16), `ServerMessageType` (16), `MessageType` union |
| **Payload Types** | TypeScript interfaces for every message (`GameActionPayload`, `GameStatePayload`, etc.) |
| **Runtime Validators** | `ClientPayloadSchemas`, `ServerPayloadSchemas` — Zod schemas for every payload |
| **Domain Types** | `GameType`, `RoomStatus`, `ParticipantStatus`, `MatchStatus`, `RoomSettings`, `SeatInfo`, `PlayerInfo`, `MatchConfig`, `MatchResult`, `GameState`, `EngineAction` |
| **Game-Specific** | `LudoAction`, `ChessAction`, `LudoEvent`, `ChessEvent`, `GameEvent` |
| **Error Codes** | `ErrorCode` const + type (`NOT_YOUR_TURN`, `ROOM_NOT_FOUND`, etc.) |
| **Utilities** | `requiresRequestId(type)`, `isClientMessage()`, `isServerMessage()` |

---

## Protocol Version

`v: 1` — hardcoded in `PROTOCOL_VERSION`. Mismatch → client rejects connection.

---

## Envelope Format

```json
{
  "v": 1,
  "type": "GAME_ACTION",
  "requestId": "req-9f2c",
  "roomId": "pm-7f3a",
  "payload": { "seat": 0, "action": { "type": "MOVE", "from": "e2", "to": "e4" } }
}
```

| Field | Direction | Required | Purpose |
|-------|-----------|----------|---------|
| `v` | both | yes | Protocol version |
| `type` | both | yes | Message type (discriminated union) |
| `requestId` | client→server | yes* | Client-generated UUID for idempotency |
| `roomId` | both | no | Present once room is joined |
| `payload` | both | yes | Type-specific body |

*Required on anything the client may retry (`GAME_ACTION`, `JOIN_ROOM`, `QUEUE_JOIN`, signaling). Omitted on `PING`.

---

## Message Flow

### Client → Server
```
AUTH → RESUME → CREATE_ROOM/JOIN_ROOM/QUEUE_JOIN
       → PLAYER_READY → START_GAME → GAME_ACTION (repeated)
       → MEDIA_OFFER/ANSWER/ICE (WebRTC signaling)
       → PING (heartbeat, 15s interval)
```

### Server → Client
```
AUTH_OK → ROOM_CREATED/ROOM_UPDATE → ROOM_STATE_CHANGE
        → PLAYER_JOINED/PLAYER_LEFT → GAME_START
        → GAME_STATE (delta during play, snapshot on join/resume)
        → ACK (per action, carries stateVersion)
        → GAME_END → MATCH_FOUND (matchmaking)
```

---

## Idempotency

Every client action that can be retried carries a `requestId` (UUID v4). The gateway maintains a per-player dedup cache in Redis (5 min TTL). Duplicate `requestId` → re-`ACK` with original `stateVersion`, **no re-apply**.

```ts
// Gateway middleware
if (requiresRequestId(message.type)) {
  if (!message.requestId) throw ERROR { code: 'BAD_REQUEST' };
  if (await redis.zscore(`dedup:${playerId}`, message.requestId)) {
    return resendOriginalAck(playerId, message.requestId);
  }
  await redis.zadd(`dedup:${playerId}`, Date.now(), message.requestId);
}
```

---

## Synchronization

- **`stateVersion`**: Monotonic counter per game session, increments **per event** (not per action).
- **Deltas** during play; **snapshots** on join/resume.
- **Gap detection**: Client tracks `lastStateVersion`. Gap → `RESUME { roomId, lastStateVersion }` → server replays buffered deltas (last 200 events or 60s) or sends full snapshot.
- **`ACK`** carries `stateVersion` after apply → client reconciles.

---

## Reconnection

```
Client                    Server (HTTP)           Gateway (WS)
  |                          |                      |
  |--- POST /auth/guest --->|                      |
  |<-- { token, gatewayUrl }|                      |
  |                          |                      |
  |========================== WS ==================>|
  |--- AUTH { token } ----->|                      |
  |--- RESUME { roomId,     |                      |
  |       lastStateVersion }|                      |
  |<-- GAME_STATE (snapshot)|                      |
  |<-- ROOM_UPDATE ---------|                      |
```

- Room state lives in **gateway memory** → reconnect must land on owning gateway.
- HTTP bootstrap returns `gatewayUrl` (or owning gateway for existing room via Redis `room:{id}:gateway`).
- Dead gateway → `ROOM_NOT_FOUND` with match safe in Postgres.

---

## Forfeit Policy

1. No message for 30s (2 missed pings) → `PLAYER_DISCONNECTED` + `FORFEIT_WINDOW { forfeitAt: now + 45s }`
2. **Game pauses** during window (no actions processed).
3. `RESUME` before `forfeitAt` → `PLAYER_RECONNECTED`, window cancelled, play resumes.
4. No resume → `GAME_END` (2-player: opponent wins; 3-4 player: game continues, forfeiter = DNF).

---

## Media Plane (WebRTC)

- Gateway **relays only** — SDP/ICE pass through untouched.
- `MEDIA_OFFER/ANSWER/ICE` carry `{ to: playerId, payload: {...} }`.
- Room setting `settings.media = { voice: true, video: false }` gates the whole plane.
- Per-player `media` in `JOIN_ROOM` gates individual participation.
- TURN: coturn in docker-compose (dev), managed provider (Twilio/Cloudflare Calls) at scale.
- No SFU for ≤4 players (mesh P2P).

---

## Usage

### Gateway (validating incoming)
```ts
import { parseEnvelope, validateEnvelope, requiresRequestId, ErrorCode } from '@repo/protocol';

ws.on('message', (data) => {
  const envelope = parseEnvelope(JSON.parse(data));
  
  if (isClientMessage(envelope.type) && requiresRequestId(envelope.type)) {
    if (!envelope.requestId) return sendError(ws, ErrorCode.BAD_REQUEST);
    // dedup check...
  }
  
  validateEnvelope(envelope); // throws if invalid
  // handle...
});
```

### Server (constructing outgoing)
```ts
import { createEnvelope, GameStatePayload, RoomStatus } from '@repo/protocol';

const statePayload: GameStatePayload = {
  kind: 'delta',
  stateVersion: 43,
  state: { board: ..., turn: 'w' },
};

ws.send(JSON.stringify(createEnvelope('GAME_STATE', statePayload, { roomId })));
```

### Web Client (type-safe handling)
```ts
import { ServerMessageType, GameStatePayload, ErrorCode } from '@repo/protocol';

ws.onmessage = (event) => {
  const envelope = JSON.parse(event.data);
  
  switch (envelope.type) {
    case 'GAME_STATE': {
      const payload = envelope.payload as GameStatePayload;
      applyState(payload.state, payload.kind, payload.stateVersion);
      break;
    }
    case 'ERROR': {
      if (envelope.payload.code === ErrorCode.NOT_YOUR_TURN) {
        // show toast, revert optimistic move
      }
      break;
    }
  }
};
```

---

## Adding a New Game

1. Add `GameType` variant: `'new-game'`
2. Define `NewGameAction extends EngineAction` and `NewGameEvent`
3. Add to `GameEvent` union
4. Engine package (`packages/engines/new-game`) implements `GameEngine` interface
5. Gateway registers engine by `gameType` string

---

## Runtime Validation

All payloads have Zod schemas in `ClientPayloadSchemas` / `ServerPayloadSchemas`.

```ts
import { validateClientMessage, ClientMessageType } from '@repo/protocol';

const payload = validateClientMessage('GAME_ACTION', rawPayload);
// payload is typed as GameActionPayload
```

Validation runs in gateway on every incoming message. Invalid → `ERROR { code: 'BAD_REQUEST' }`.

---

## Testing

```bash
cd packages/protocol
bunx tsx -e "
import { createEnvelope, validateEnvelope, requiresRequestId, ErrorCode } from './src/index';

const env = createEnvelope('GAME_ACTION', { seat: 0, action: { type: 'MOVE', from: 'e2', to: 'e4' } }, { requestId: 'req-1', roomId: 'room-1' });
console.log(validateEnvelope(env));
console.log(requiresRequestId('GAME_ACTION')); // true
console.log(requiresRequestId('PING')); // false
"
```