# PlayMesh Roadmap

## Phase 1: Workspace Bootstrap (No product code yet)

**`packages/`**

- `packages/protocol` — TypeScript types for all envelope/message types from `protocol.md` (`GAME_ACTION`, `GAME_STATE`, `ACK`, etc.)
- `packages/engines/chess` — `lib-chess.js` (as discussed)
- `packages/engines/ludo` — `nerdev-co/ludo.js` (as discussed)
- `packages/types` — shared domain types (`Player`, `Room`, `Match`, `Seat`)

**`apps/`**

- `apps/server` — main server (Bun, HTTP): auth bootstrap, history, gateway resolution
- `apps/ws-gateway` — WebSocket gateway (Bun): rooms, engine sessions, matchmaking
- `apps/web` — Next.js frontend

---

## Phase 2: Server Core

| Area                      | What to build                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transport**             | WebSocket gateway with the envelope format from `protocol.md`                                                                                                             |
| **Auth**                  | Guest token flow over HTTP (`apps/server`) → `AUTH` → `AUTH_OK` on WS; stateless JWT, shared secret between server and gateway                                            |
| **Room lifecycle**        | `WAITING → STARTING → IN_PROGRESS → FINISHED → ARCHIVED` state machine                                                                                                    |
| **Routing seam**          | HTTP bootstrap returns gateway URL; `room:{id}:gateway` / `player:{id}:gateway` in Redis for reconnect affinity (multi-gateway ready from day one, see `architecture.md`) |
| **Matchmaking**           | `QUEUE_JOIN` / `QUEUE_LEAVE`, Redis zset queues, `botFill` timeout                                                                                                        |
| **Game engine interface** | Common interface both chess and ludo engines implement (`applyAction`, `createInitialState`, `legalActions`, `chooseBotAction`)                                           |
| **Event system**          | Per-room delta buffer, event emission, resync logic                                                                                                                       |
| **Dedup**                 | Per-player requestId cache in Redis                                                                                                                                       |

---

## Phase 3: Persistence

| Area               | What to build                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **Postgres**       | Migrations for `users`, `matches`, `match_events` (schemas in `persistence.md`)                       |
| **Redis**          | Presence TTL, matchmaking queues, dedup zsets, room→gateway routing                                   |
| **Event flushing** | Gateway direct-write: async batch writer (1s or 50 events) straight to Postgres — no consumer process |
| **Archive job**    | Gateway moves finished matches from memory to Postgres and commits, evicts room state                 |

---

## Phase 4: First Game — Ludo

| Area                    | What to build                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| **Engine wiring**       | Server creates `Game` instance on `GAME_START`, calls `updateState()` on each `GAME_ACTION`             |
| **Dice authority**      | Server generates `DICE_ROLL` actions; clients only send `TOKEN_ACTION`                                  |
| **Bot AI**              | Server-side actor that chooses legal `TOKEN_ACTION`; for Ludo this is mostly random or simple heuristic |
| **Event decomposition** | Split `TokenAction.verbs` into protocol events (`move`, `kill`, `ascend`, `born`)                       |
| **Client mirror**       | Web app runs local `createGame()`, applies server events for rendering                                  |

---

## Phase 5: Second Game — Chess

Same layers as Ludo, but:

- No dice randomness
- Single action type (`MOVE`)
- Simpler bot (minimax or random legal move)
- FEN as state representation

---

## Phase 6: Client

| Area                     | What to build                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **WebSocket client**     | HTTP bootstrap (token + gateway URL), envelope send/receive, reconnect/resume to the affinitized gateway                |
| **Lobby**                | Room list, create/join, matchmaking queue UI                                                                            |
| **Game UI**              | Board rendering, move input, legal move highlights                                                                      |
| **WebRTC relay**         | `MEDIA_OFFER`/`MEDIA_ANSWER`/`MEDIA_ICE` relay in the gateway                                                           |
| **WebRTC client + TURN** | Client video/voice UI, renegotiation; coturn in compose (dev), managed provider (Twilio/Cloudflare Calls) path at scale |
| **History**              | Match list, event replay from Postgres                                                                                  |
| **Auth/profile**         | Guest token storage, username, avatar                                                                                   |

---

## Phase 7: Polish

- Rate limiting
- Observability (logs, metrics)
- Error handling + typed error codes from `protocol.md`
- Load testing
- APK distribution (mentioned in README)

---

## Pre-flight (decisions before Phase 7)

- **Engine licensing** — block APK distribution if unresolved: `ludo.js` is
  GPL-class (copyleft: bundling into a distributed APK imposes source
  obligations); our chess implementation is self-written (clean); reference
  repos are MIT-class. Decide per-game license compatibility before shipping.
- **TURN provider** — self-hosted coturn in compose for dev; decide at scale
  whether it stays self-hosted or moves to a managed provider.

---

## Recommended Next Step

The repo has zero code. Start with:

1. **`packages/protocol`** — define all TypeScript types from `protocol.md`. Everything else depends on this.
2. **`packages/engines/ludo`** — port `nerdev-co/ludo.js` into the workspace; it's the most complex engine and will surface interface design questions.
3. **`apps/ws-gateway` + `apps/server`** — minimal WebSocket gateway that can create a room and apply one Ludo action, with the server's HTTP bootstrap (auth + gateway resolution).
