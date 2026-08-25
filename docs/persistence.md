# Playmesh Persistence

Two stores, one writer:

- **Postgres** — durable truth: users, matches, match event log. Survives restarts.
  Written directly by the **ws-gateway** (batched flush — no consumer process,
  no event bus). See `architecture.md`.
- **Redis** — ephemeral live state: presence, matchmaking queues, action dedup
  cache, room→gateway routing. Rebuildable, evictable.

## Postgres

### users

```sql
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username    TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

v1 auth: guest tokens (anonymous user created on first `AUTH`). No password
storage, no email, no ratings, no friends. Extend later.

### matches

```sql
CREATE TABLE matches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id     TEXT NOT NULL,
    game        TEXT NOT NULL,              -- "ludo" | "chess" | ...
    status      TEXT NOT NULL,              -- IN_PROGRESS | FINISHED | ARCHIVED
    seats       JSONB NOT NULL,             -- [{ seat, player_id, bot, result }]
    result      JSONB,                      -- { winner, reason, dnf: [] }
    config      JSONB NOT NULL,             -- room settings snapshot at start
    final_state JSONB,                      -- engine's final GameState; instant history rendering
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);
CREATE INDEX idx_matches_player ON matches USING GIN (seats jsonb_path_ops);
CREATE INDEX idx_matches_game_status ON matches (game, status);
```

`seats` holds everything needed for match history: who played, who won, who DNF'd.
A game is one match row; its full move history is the event log below.

### match_events

```sql
CREATE TABLE match_events (
    id          BIGSERIAL PRIMARY KEY,
    match_id    UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    version     BIGINT NOT NULL,            -- session stateVersion (per-event)
    seat        INT,
    event       JSONB NOT NULL,             -- { type, ... } opaque to storage
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (match_id, version)
);
CREATE INDEX idx_events_match ON match_events (match_id, version);
```

This is the durable event log — the same events the delta buffer replays in
memory. After a match is `ARCHIVED` and the buffer evicts, this table is the
source for full replays and history pages.

Writes: the **ws-gateway** batches events and flushes async during play; the
batch is committed when the match reaches `FINISHED`/`ARCHIVED` (or on a
flush interval — 1s or 50 events, whichever first).

## Redis

| Key                         | Type   | Purpose                                                                                                                                             |
| --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `presence:{playerId}`       | string | JSON `{ status, roomId }`; TTL 90s, refreshed by heartbeat.                                                                                         |
| `queue:{game}`              | zset   | Matchmaking: member = playerId, score = enqueue ms.                                                                                                 |
| `dedup:{playerId}`          | zset   | Recent `requestId`s (score = time); prune > 5 min.                                                                                                  |
| `room:{roomId}:gateway`     | string | Owning gateway host for a room; reconnect affinity. TTL while room lives.                                                                           |
| `player:{playerId}:gateway` | string | Owning gateway for a player's current room; lets a reconnecting client find its room after a fresh HTTP bootstrap. TTL 90s, refreshed by heartbeat. |

- **Presence** — tells the lobby who's online; also backs the disconnect
  detector (missing heartbeat ⇒ stale presence ⇒ `PLAYER_DISCONNECTED`).
- **Queue** — zsets give FIFO matchmaking per game plus easy `botFill` after a
  timeout (peek oldest, seat them, fill rest with bots).
- **Dedup** — idempotency across reconnects: `(playerId, requestId)` check.
  In-memory per room would be lost on reconnect to a different server instance.

### Deliberately NOT in Redis

- **Live room state** — held in the ws-gateway's memory. Rooms are hot mutable
  state (every action rewrites them); Redis round-trips would double latency.
  Tradeoff: a gateway crash loses in-flight rooms. Acceptable for v1 — matches
  and events already persisted are recoverable; rooms are re-creatable.

## Match history queries

```
SELECT * FROM matches WHERE seats @> '[{"player_id": "<id>"}]'
ORDER BY started_at DESC LIMIT 20;
```

Game-specific stats (win rate, streak) are derived from `matches` — no separate
stats table. Leaderboard (later): `SELECT player_id, count(*) FILTER (result =
'win') ... GROUP BY` or a materialized view when it gets slow.

## Out of scope (v1)

- Ratings/ELO — explicitly skipped per decision.
- Friends, DMs, invites outside rooms.
- Tournaments, wallets, betting — separate plane.
