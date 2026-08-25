# PlayMesh

**Real-Time Multiplayer Game**

- Features: Real-time communication between players, game state synchronization, leaderboard.
- Technologies: WebRTC (media plane), React, Bun, TypeScript.
- Description: Develop a multiplayer game website where players can compete in real-time. Use WebRTC for player communication and state synchronization.
- Game engines, RTC, Server state management, Distributing via APKs, Operational — Figuring out licenses: `ludo.js` is GPL-class (copyleft on distribution, relevant to APK shipping); our chess implementation is self-written; reference repos are MIT-class. Decision due before Phase 7 — see `roadmap.md`.
- Example:
- Ludo app where you can also bet, connect over webrtc like a video call, have a user auth and profile, can see your history; [lib-ludo.js](https://github.com/nerdev-org/ludo.js/)
- [Chess app](https://youtu.be/vSJsz7tNuyU?si=O8NQ_VacYKzxbPWN) with onCall game, user auth, and collect user stats similar to chess.com, [impl](https://github.com/code100x/chess/tree/main)

  - [lib-chess.js](https://github.com/NalinDalal/chess.js) : our own implementation

- Snake ladder: [be](https://github.com/shrinjoy979/multiplayer-snake-and-ladder-game-backend/tree/main), [fe](https://github.com/shrinjoy979/multiplayer-snake-and-ladder-game-frontend)

- checkers

- Uno - [gh](https://github.com/eperezcosano/Uno), [blog-1](https://eperezcosano.github.io/uno-part1/), [blog-2](https://eperezcosano.github.io/uno-part2/)

[Tic-Tac-Toe](https://youtu.be/YUgUC8knm-I?si=XRrs616gEp1y-al6)
you may use [this also](https://github.com/NalinDalal/scalable-stateful-app)

---

## How Packages Will Be Utilized

This repo is a **Turborepo monorepo** with two workspace roots:

```
playmesh/
├── apps/
│   ├── server/           ← main server (Bun, HTTP): auth bootstrap, history, gateway resolution
│   ├── ws-gateway/       ← WebSocket gateway (Bun): rooms, engines, matchmaking, bot fill
│   └── web/              ← Next.js frontend
└── packages/
    ├── protocol/         ← envelope + message types (protocol.md)
    ├── types/            ← shared domain types (Player, Room, Match, Seat)
    └── engines/
        ├── core/         ← GameEngine interface + registry
        ├── chess/        ← lib-chess.js lives here
        └── ludo/         ← ludo engine lives here
```

Two processes, one seam: `apps/ws-gateway` handles everything live over the
WebSocket (room state in memory, engine sessions, delta buffer) and writes
matches/events to Postgres directly; `apps/server` handles the cold path
(auth, history, gateway resolution). Redis is the ephemeral glue — presence,
matchmaking queues, dedup, room→gateway routing. See `docs/architecture.md`.

### 1. `packages/engines/chess/` — The Package

This is where `lib-chess.js` would be developed and published as a workspace package:

```
packages/engines/chess/
├── package.json          ← { "name": "@playmesh/chess" }
├── src/
│   ├── index.ts          ← exports: Chess, Move, GameResult, etc.
│   ├── engine.ts         ← core state machine
│   ├── moves.ts          ← move generation/validation
│   └── types.ts          ← shared types (FEN, Move, GameState)
├── tests/
└── README.md
```

The `apps/*` and `packages/*` globs in root `package.json:25-28` automatically link these workspaces together.

### 2. The Gateway Consumes It

The ws-gateway (`apps/ws-gateway/`) declares the dependency in its own
`package.json`:

```json
{
  "dependencies": {
    "@playmesh/chess": "workspace:*"
  }
}
```

Usage in a room session (the gateway holds one engine instance per active
room; on `GAME_ACTION` it validates seat/turn, applies, and broadcasts the
produced events):

````ts
// pseudocode — one session per room in the gateway
class ChessSession {
  engine: GameEngine; // created via the engine registry
  // on GAME_ACTION from seat s:
  //   const { events, state, gameOver, result } = this.engine.applyAction(this.state, s, action)
  //   → bump stateVersion per event, buffer, broadcast, persist batch
}

### 3. Client Consumes It

The web app (`apps/web/`) also declares the workspace dependency:

```json
{
  "dependencies": {
    "@playmesh/chess": "workspace:*"
  }
}
````

Used for:

- Rendering the board from `GAME_STATE` FEN
- Highlighting legal moves locally (`engine.legalMoves(square)`)
- Optimistic UI pre-validation (server is still the authority)

```tsx
const engine = new Chess(serverFEN);
const moves = engine.moves({ square: fromSquare, verbose: true });
// pass moves to UI layer for highlight rendering
```

### 5. Shared Types (Cross-Cutting)

`lib-chess.js` exports types that the protocol layer also uses:

```ts
export type { Move, FEN, GameState, GameResult };
```

The protocol package (`packages/protocol/`) can import these so `GAME_ACTION` and `GAME_STATE` schemas stay in sync with what the engine actually produces/consumes — no duplicated type definitions.

---

## Summary

| Layer                    | Consumes `@playmesh/chess` | Purpose                                 |
| ------------------------ | -------------------------- | --------------------------------------- |
| `packages/engines/chess` | —                          | Defines and exports the engine          |
| `apps/ws-gateway`        | `workspace:*`              | Authoritative validation, state, bot AI |
| `apps/web`               | `workspace:*`              | Rendering, move preview, UX validation  |
| `packages/protocol`      | `workspace:*`              | Types for message schemas               |
