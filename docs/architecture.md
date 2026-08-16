# PlayMesh System Architecture

Two processes, one WebSocket transport, Postgres as durable truth, Redis as the
live-state glue.

```
┌─────────────┐   HTTP (REST)   ┌──────────────────┐
│  apps/web   │ ───────────────▶│  apps/server     │──▶ Postgres
│  (Next.js)  │ ◀───────────────│  (Bun, HTTP API) │    auth, match history
└──────┬──────┘                 └──────────────────┘
       │ WebSocket (envelope protocol)
       ▼
┌────────────────────────┐  direct writes  ┌──────────────┐
│  apps/ws-gateway       │ ───────────────▶│   Postgres   │
│  (Bun, WebSocket)      │                 │ matches,     │
│  rooms · engines ·     │                 │ match_events │
│  matchmaking · bots    │                 └──────────────┘
│  delta buffer          │ ◀─────/──────▶  Redis
└────────────────────────┘   presence, queues, dedup,
                             room→gateway routing
```

## Why two processes

Room traffic (state sync, actions, broadcast, heartbeat, forfeits) is a
different lifetime and scaling axis than HTTP (auth, history, profile). The
gateway owns the hot path; the server owns the cold path. Adding games later
means adding engine packages, not touching this split.

## Responsibilities

### `apps/server` — main server (Bun, HTTP only)

- Guest token issuance and verification (JWT, shared secret with gateway)
- REST API: `AUTH` bootstrap, match history, match replay, profile
- Gateway endpoint resolution: tells a client which WS URL to connect to
- Reads Postgres (history/replays) and Redis (presence for lobby)

### `apps/ws-gateway` (Bun, WebSocket only)

- All WebSocket connections and the envelope transport (`protocol.md`)
- Room lifecycle: `WAITING → STARTING → IN_PROGRESS → FINISHED → ARCHIVED`
- Game sessions: engine registry, action validation, turn order, delta buffer,
  resync on `RESUME`
- Matchmaking queues + bot fill; bots run inside the gateway as seats,
  identical to humans over the wire
- Heartbeats, forfeit windows, presence writeback to Redis
- Dedup cache (per-player `requestId`) in Redis
- **Persists to Postgres directly** — no event-bus consumer in between

## Authority model

| Layer | Authority |
|-------|-----------|
| Live room state | Gateway (in-memory, hot path) |
| Durable truth | Postgres — written **by the gateway** via batched flush |
| Ephemeral glue | Redis — presence, queues, dedup, routing; rebuildable |

- Clients never mutate state. State flows down, actions flow up.
- The gateway writes `match_events` in batches (1s or 50 events, whichever
  first) and commits the match row when it reaches `FINISHED`/`ARCHIVED`.
  History endpoints read committed rows only, so they're never mid-write.

## Reconnect affinity (in from day one)

Room state lives in the gateway's memory, so a reconnect must land on the
same gateway that owns the room.

1. Client bootstraps over HTTP: main server returns a guest token **and the
   gateway URL** (or the room's owning gateway for rooms it's already in).
2. Client opens the WS: `AUTH` → `RESUME { roomId, lastStateVersion }`.
3. Gateway keeps `room:{roomId}:gateway` and `player:{playerId}:gateway` in
   Redis so a restarting client can find its room after a fresh bootstrap.
4. N gateways = a config change, not a rewrite: bootstrap points at the
   owning gateway; a crashed gateway degrades to `ROOM_NOT_FOUND` with the
   match already safe in Postgres (the accepted crash loss from
   `persistence.md`).

What the gateway does **not** do: proxy to other gateways, shard rooms across
itself, or re-host an orphaned room. v1 keeps affinity simple.

## Engines

`packages/engines/*` implement a common `GameEngine` interface
(`packages/engines/core`): `createInitialState`, `applyAction(state, seat,
action) → { events, state, gameOver, result }`, `legalActions`, and
`chooseBotAction` for bots. The gateway's session layer is written once against
this interface; chess, ludo, and anything later are drop-in packages.

## What is deliberately NOT here

- No Redis pub/sub fan-out for game state (state is gateway-local by design)
- No separate persistence consumer process (gateway writes directly)
- No SFU — media is mesh P2P per `protocol.md`, fine for ≤4 players. TURN is
  **coturn**, an off-the-shelf relay container in docker-compose (used only
  when direct P2P fails); the upgrade path at scale is a managed provider
  (Twilio/Cloudflare Calls). Like Postgres/Redis, it's infra — no application
  server, no code to write.