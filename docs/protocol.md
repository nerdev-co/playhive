# Playmesh Protocol v1

Living spec. Single transport: **one WebSocket connection** carries everything —
auth, room events, game actions, authoritative state, reconnection, WebRTC
signaling, and (later) chat + ambient media. WebRTC data channels are **not**
used for game state.

## Core rules

1. **State flows down, actions flow up.** Only the server mutates game state.
2. **The server is the authority.** Clients may pre-validate for UX, never for truth.
3. **Idempotency by `requestId`.** Every client action is retried safely.
4. **Sync by `stateVersion`.** One monotonic counter covers ordering, gaps,
   reconnection, and replays.
5. **Signaling is relayed, never parsed.** SDP/ICE pass through untouched.

## Envelope

Every message is a JSON object:

```json
{
  "v": 1,
  "type": "GAME_ACTION",
  "requestId": "req-9f2c",
  "roomId": "pm-7f3a",
  "payload": {}
}
```

| Field       | Direction     | Required | Meaning                                             |
|-------------|---------------|----------|-----------------------------------------------------|
| `v`         | both          | yes      | Envelope version. Mismatch → client rejects.        |
| `type`      | both          | yes      | Message type (below).                               |
| `requestId` | client→server | yes*     | Client-generated UUID. Dedup key; echoed in ACK.    |
| `roomId`    | both          | no       | Present once a room is joined.                      |
| `payload`   | both          | yes      | Type-specific body.                                 |

\* `requestId` required on anything the client may retry (`GAME_ACTION`,
`JOIN_ROOM`, `QUEUE_JOIN`, signaling). Omit on heartbeats.

## Message types

### Client → Server

| Type                 | Purpose                                                        |
|----------------------|----------------------------------------------------------------|
| `AUTH`               | Authenticate with session/guest token.                         |
| `RESUME`             | Reconnect to a room: `{ roomId, lastStateVersion, lastSeq }`.  |
| `CREATE_ROOM`        | `{ game, maxPlayers, private, settings: { media } }`.          |
| `JOIN_ROOM`          | `{ inviteCode, media: { voice, video } }`.                     |
| `LEAVE_ROOM`         | Leave room (before game start = unseat; forfeit if in progress).|
| `PLAYER_READY`       | Mark ready.                                                    |
| `PLAYER_UNREADY`     | Unmark ready.                                                  |
| `START_GAME`         | Host only. Forces `STARTING` when ready conditions met.        |
| `GAME_ACTION`        | Game-specific action: `{ seat, action }`.                      |
| `ROOM_SETTINGS_UPDATE`| Host only. e.g. toggle `settings.media`.                      |
| `QUEUE_JOIN`         | Matchmaking: `{ game, botFill: true, fillAfterMs }`.           |
| `QUEUE_LEAVE`        | Leave matchmaking queue.                                       |
| `MEDIA_OFFER`        | `{ to, payload: { sdp } }` — relayed to peer.                  |
| `MEDIA_ANSWER`       | `{ to, payload: { sdp } }` — relayed to peer.                  |
| `MEDIA_ICE`          | `{ to, payload: { candidate } }` — relayed to peer.            |
| `PING`               | Heartbeat.                                                     |

### Server → Client

| Type                 | Purpose                                                        |
|----------------------|----------------------------------------------------------------|
| `AUTH_OK`            | `{ playerId, token }`.                                         |
| `AUTH_ERROR`         | `{ code }`.                                                    |
| `ROOM_CREATED`       | `{ roomId, inviteCode, room }` full room snapshot.             |
| `ROOM_UPDATE`        | Full room snapshot: seats, players, settings, status. The room truth.|
| `ROOM_STATE_CHANGE`  | `{ from, to }` lifecycle transition.                           |
| `PLAYER_JOINED`      | `{ seat, player }`.                                            |
| `PLAYER_LEFT`        | `{ seat, reason: "left" | "kicked" }`.                         |
| `PLAYER_DISCONNECTED`| `{ seat }`.                                                    |
| `PLAYER_RECONNECTED` | `{ seat }`.                                                    |
| `FORFEIT_WINDOW`     | `{ seat, forfeitAt }` grace timer started.                     |
| `GAME_START`         | `{ seatOrder, config, initialState }`.                         |
| `GAME_STATE`         | `{ kind: "snapshot" | "delta", stateVersion, state }`.         |
| `GAME_END`           | `{ result, winner, reason, stats }`.                           |
| `MATCH_FOUND`        | `{ roomId, inviteCode }` → client joins with auto-ready.       |
| `ACK`                | `{ requestId, stateVersion }` action applied.                  |
| `ERROR`              | `{ code, message, requestId? }`.                               |
| `PONG`               | Heartbeat reply.                                               |

## Game actions

Actions are opaque to the room. The engine validates and applies them.

```json
{
  "v": 1,
  "type": "GAME_ACTION",
  "requestId": "req-41",
  "roomId": "pm-7f3a",
  "payload": { "seat": 0, "action": { "type": "MOVE", "from": "e2", "to": "e4" } }
}
```

Dice games carry the random seed server-side; clients never send dice values.

## Synchronization

- Server assigns `stateVersion` — monotonic, per game session.
- Deltas broadcast during play (latency); snapshots on join/resume.
- Client tracks `lastStateVersion` applied. Gap detected → `RESUME` / resync:
  server replays buffered deltas (last N events, e.g. 200) or sends a snapshot.
- `ACK` carries the `stateVersion` after applying, so the client can reconcile.

## Reconnection

```
client                          server
  |  AUTH { token }                |
  |  RESUME { roomId, lastStateVersion: 41 } |
  |------------------------------->|
  |  GAME_STATE (snapshot, v43)   |  (or deltas 42..43 if still buffered)
  |<-------------------------------|
  |  ROOM_UPDATE                   |
  |<-------------------------------|
```

Rules:

- Reconnect allowed while room status is `IN_PROGRESS` or later.
- Disconnect + no resume within grace (45s) → `GAME_END` forfeit.
- Actions sent with `requestId` are deduped via `(playerId, requestId)`; a
  retried action after reconnect gets an `ACK` with the same `stateVersion`.

## Idempotency

Server keeps a short-lived dedup cache per player (last N requestIds). Duplicate
`GAME_ACTION` → re-`ACK` with the original `stateVersion`, **no re-apply**.

## Room lifecycle

```
WAITING → STARTING → IN_PROGRESS → FINISHED → ARCHIVED
```

- `WAITING`: players join, mark ready, host edits settings.
- `STARTING`: all seats filled + all humans ready + host `START_GAME`
  (or auto-start 10s after matchmaking fill). Engine creates initial state.
- `IN_PROGRESS`: session runs the engine; actions validated against turn order.
- `FINISHED`: engine reports game over; room records result; stats update.
- `ARCHIVED`: room state persisted to Postgres, evicted from memory/Redis.

Room settings (host-only mutation):

```json
"settings": {
  "media": { "voice": true, "video": false },
  "maxPlayers": 4,
  "private": true
}
```

`media` gates the whole media plane. Per-player `media` flags in `JOIN_ROOM`
gate individual participation. The room layer reads `settings.media`; the game
session and engine never see it.

## Event model

An **event** is the atomic unit of state change — the smallest delta a client
can apply on top of its existing state. The engine's `applyAction` produces
1..n events per action; each is independently composable, in order.

Granularity, Ludo example:

```
1. GAME_START                → event 0: initial board (snapshot)
2. GAME_ACTION ROLL_DICE     → event 1: { type: "dice", value: 4 }
3. GAME_ACTION MOVE_TOKEN    → event 2: { type: "move", token: 3, from: 7, to: 11 }
4. capture triggered by move  → event 3: { type: "captured", token: 2, backTo: "home" }
```

- `stateVersion` increments **per event**. Clients track the last applied event version.
- An **action** is the client's request (coarse); **events** are what the server
  broadcasts, buffers, and replays on resync.
- A **turn** is a player's sequence of actions (roll + move) ≈ 2-3 events.
- 200 buffered events ≈ a full Ludo game (4 players, ~15 turns each).

## Delta buffer

Per-game-session, in-memory ring buffer of the most recent events emitted by
the engine. Its only job: let a client that fell behind **resync by replaying
events** instead of receiving a full snapshot.

```
entry: { version: 43, seat: 1, event: { type: "dice", value: 4 }, at: 12:04:11 }
```

Eviction rule (whichever binds first):

- **Count cap**: keep the last 200 events.
- **Age cap**: keep only events younger than 60 seconds (wall-clock).

On `RESUME { lastStateVersion: v }`:

- `v` ≥ oldest buffered version → replay buffered events `v+1..latest`. Fast path.
- `v` < oldest buffered version (or unknown) → send a full snapshot. Slow path,
  but cheap at this scale — a Ludo board is ~50 squares; a snapshot is a few KB.

Buffer is memory-only and cleared on `ARCHIVED`. After `GAME_END`, replaying
still works from the buffer until eviction; after that, clients get the
persisted final state from Postgres.

## Forfeit policy

Timeline:

1. Heartbeat every 15s; **no message for 30s** (2 missed pings) → server marks
   `PLAYER_DISCONNECTED`, broadcasts `FORFEIT_WINDOW { seat, forfeitAt }`.
2. **The game pauses during the window.** No actions processed; the grace timer
   is wall-clock, not game-clock.
3. `RESUME` before `forfeitAt` → `PLAYER_RECONNECTED`, window cancelled, play
   resumes from the paused state (their un-committed action was never applied —
   they re-send with the same `requestId`, dedup just ACKs it).
4. No resume → `GAME_END`.

Win assignment:

- **2-player games**: forfeit → opponent wins immediately.
- **3-4 player games** (Ludo): the game **continues** with the remaining
  players — no bot takeover; the forfeiter is recorded as DNF. Winner is the
  first to finish; game ends on a win or when all but one have forfeited.

## Matchmaking

```
QUEUE_JOIN { game, botFill, fillAfterMs }
  → MATCH_FOUND { roomId, inviteCode }
  → client JOIN_ROOM (auto-ready)
  → all seats full + ready → STARTING
  → unfilled seats get bots after fillAfterMs
```

Bots are seats occupied by a server-side actor. The room sees "player" only.

## Signaling relay

SDP/ICE ride the WS as opaque payloads, routed by `to` (playerId). Never parsed,
never validated beyond peer membership.

```
client A → server: MEDIA_OFFER { to: "B", payload: { sdp } }
server  → client B: MEDIA_OFFER { from: "A", payload: { sdp } }
```

ICE trickle, renegotiation (video on/off), and TURN candidates flow the same way.
Media plane is mesh P2P with TURN relay fallback (coturn); no SFU for ≤4 players.

## Errors

Typed codes: `NOT_AUTHED`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `INVALID_ACTION`,
`NOT_YOUR_TURN`, `NOT_HOST`, `GAME_ALREADY_STARTED`, `FORBIDDEN`, `BAD_REQUEST`,
`RATE_LIMITED`, `SERVER_ERROR`.

```json
{ "v": 1, "type": "ERROR", "payload": { "code": "NOT_YOUR_TURN", "message": "..." } }
```

## Heartbeats

`PING` every 15s; missed two consecutive → server marks disconnected and starts
the forfeit window.

## Out of scope (extension planes)

- `CHAT` — text messages, same envelope, room relays.
- `AMBIENT_SYNC` — YouTube/Spotify loose sync: `{ trackId, position, state }`.
  Non-authoritative, best-effort, server relays only.
- `WALLET` / betting — separate plane, never touches engines or session.
- Spectators — read-only `ROOM_UPDATE` + `GAME_STATE`; no seats, no actions.

## Decided

- **Bots play to win. Period.** Single policy in v1 — the bot always chooses the
  winning move when one exists (deterministic games: perfect play; dice games:
  optimal move given the roll). No difficulty knob in v1. The session only sees
  `chooseAction(state, player)` — the bot is just a seat filled by a server-side
  actor, identical to a human over the wire.
- **Event granularity**: one event per atomic state change (roll = 1 event,
  token move = 1 event, capture = 1 event). `stateVersion` is per-event.
- **Delta buffer**: last **200 events, but no older than 60 seconds** — whichever
  binds first. Replay if the client's version is still in the window, snapshot
  otherwise.
- **Forfeit grace**: fixed **45s**, not host-configurable (v1).
- **Forfeit window: the game pauses.** Rationale: the grace is capped at 45s, so
  the maximum stall is bounded and deterministic; skipping turns in a dice game
  changes outcomes unfairly; and "paused" requires no clock/skip logic. The
  player's un-committed action was never applied, so resume is seamless.

## Open questions

(none — move to implementation)
