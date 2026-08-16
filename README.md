# PlayMesh

**Real-Time Multiplayer Game**

- Features: Real-time communication between players, game state synchronization, leaderboard.
- Technologies: WebRTC Data Channels, React, Node.js, TypeScript.
- Description: Develop a multiplayer game website where players can compete in real-time. Use WebRTC for player communication and state synchronization.
- Game engines, RTC, Server state management, Distributing via APKs, Operational - Figuring out licenses
- Example:
- Ludo app where you can also bet, connect over webrtc like a video call, have a user auth and profile, can see your history
    -[lib-ludo.js](https://github.com/nerdev-org/ludo.js/)
- [Chess app](https://youtu.be/vSJsz7tNuyU?si=O8NQ_VacYKzxbPWN) with onCall game, user auth, and collect user stats similar to chess.com, [impl](https://github.com/code100x/chess/tree/main)


    - [lib-chess.js](https://github.com/NalinDalal/chess.js) : our own implementation
    

- Snake ladder: [be](https://github.com/shrinjoy979/multiplayer-snake-and-ladder-game-backend/tree/main), [fe](https://github.com/shrinjoy979/multiplayer-snake-and-ladder-game-frontend)

- checkers

- Uno - [gh](https://github.com/eperezcosano/Uno), [blog-1](https://eperezcosano.github.io/uno-part1/), [blog-2](https://eperezcosano.github.io/uno-part2/)

[Tic-Tac-Toe](https://youtu.be/YUgUC8knm-I?si=XRrs616gEp1y-al6)
you may use [this also](https://github.com/NalinDalal/scalable-stateful-app)

---------

## How Packages Will Be Utilized

This repo is a **Turborepo monorepo** with two workspace roots:

```
playmesh/
├── apps/
│   ├── server/           ← Go/Node game server
│   └── web/              ← Next.js frontend
└── packages/
    └── engines/
        └── chess/        ← lib-chess.js lives here
```

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

### 2. Server Consumes It

The server (`apps/server/`) declares the dependency in its own `package.json`:

```json
{
  "dependencies": {
    "@playmesh/chess": "workspace:*"
  }
}
```

Usage in a room session:

```go
// pseudocode — server holds one engine instance per active room
type ChessRoom struct {
    engine *chess.Chess
}

func (r *ChessRoom) ApplyAction(seat int, action Action) ([]Event, error) {
    if !r.engine.IsLegal(action) {
        return nil, ErrInvalidAction
    }
    r.engine.Move(action.From, action.To)
    return r.engine.Events(), nil  // delta events to broadcast
}
```

### 3. Client Consumes It

The web app (`apps/web/`) also declares the workspace dependency:

```json
{
  "dependencies": {
    "@playmesh/chess": "workspace:*"
  }
}
```

Used for:
- Rendering the board from `GAME_STATE` FEN
- Highlighting legal moves locally (`engine.legalMoves(square)`)
- Optimistic UI pre-validation (server is still the authority)

```tsx
const engine = new Chess(serverFEN);
const moves = engine.moves({ square: fromSquare, verbose: true });
// pass moves to UI layer for highlight rendering
```

### 4. Turborepo Orchestrates It

Running `turbo run build` at the root:
1. Builds `packages/engines/chess` first (declared dependency)
2. Then builds `apps/server` and `apps/web` (which depend on it)
3. Runs `dev` in parallel across all workspaces

### 5. Shared Types (Cross-Cutting)

`lib-chess.js` exports types that the protocol layer also uses:

```ts
export type { Move, FEN, GameState, GameResult };
```

The protocol package (`packages/protocol/`) can import these so `GAME_ACTION` and `GAME_STATE` schemas stay in sync with what the engine actually produces/consumes — no duplicated type definitions.

---

## Summary

| Layer | Consumes `@playmesh/chess` | Purpose |
|-------|---------------------------|---------|
| `packages/engines/chess` | — | Defines and exports the engine |
| `apps/server` | `workspace:*` | Authoritative validation, state, bot AI |
| `apps/web` | `workspace:*` | Rendering, move preview, UX validation |
| `packages/protocol` | `workspace:*` | Types for message schemas |


