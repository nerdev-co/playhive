# PlayMesh Engine Contract

How game engines plug into the gateway. One interface, many games; chess and
ludo implement it, Uno/Poker/etc. are drop-in later.

## Permission split

Three kinds of permission, three layers:

| Permission | Owner | Examples |
|-----------|-------|----------|
| Identity (may this connection act here?) | **Gateway/session** | seated + authed + room `IN_PROGRESS` |
| Turn + legality (is this action valid?) | **Engine** | chess: it's white's move; ludo: token can move 4 |
| Visibility (what may this seat see?) | **Engine** (`viewFor`) | chess/ludo: everything; Uno/poker: projected views |

Rule: the gateway never validates game rules, and the engine never sees the
room. They meet only at actions and events.

## Interface (`packages/engines/core`)

```ts
interface GameEngine {
  readonly id: string;                // "chess", "ludo", ...
  readonly displayName: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  createInitialState(config: EngineConfig, seats: number[]): GameState;
  // GameState is opaque JSON to the gateway. Must be plain serializable data
  // (no class instances, no functions) — it travels in envelopes and the DB.

  applyAction(state: GameState, seat: number, action: EngineAction): ApplyResult;
  // throws EngineError { code: "NOT_YOUR_TURN" | "INVALID_ACTION" | ... }
  // ApplyResult = { events: GameEvent[], state: GameState, gameOver: boolean, result?: MatchResult }

  legalActions(state: GameState, seat: number): EngineAction[];  // UI hints + bot input
  canAct(state: GameState, seat: number): boolean;               // cheap turn check

  chooseBotAction(state: GameState, seat: number): EngineAction | null;

  viewFor?(state: GameState, seat: number): GameState;           // hidden-info games only
}
```

- `registerEngine(engine)` / `getEngine(id)` live in core; the gateway
  resolves a room's engine by `id` at `GAME_START`.
- Matchmaking reads `minPlayers`/`maxPlayers` from the registry.
- Errors map to envelope codes: `NOT_YOUR_TURN`, `INVALID_ACTION`, ...

## Events

- An event is the atomic unit of state change; `stateVersion` increments per
  event (protocol.md).
- Events must be **public-safe**: for perfect-info games they carry full
  detail; hidden-info games emit only revealed knowledge
  (`played a red 5`, not `played the card you were holding`).
- Outcomes are recorded *in the events* (a dice value is an event), so
  replay/rebuild is deterministic — no RNG replay problem.

## Bots

**Bots play to win. Period.** Single policy in v1, no difficulty knob:

- Chess: minimax with alpha-beta pruning, depth bounded by latency (~2–4).
- Ludo: optimal move given the roll.
- The gateway schedules bot turns with a small think delay (~700ms) so human
  opponents don't see instant teleporting moves.
- Policy: after each settled action, the session loops — *whose turn? still a
  bot? → think → act* — with a hard iteration cap so nothing can loop forever.

## Chess (reference implementation)

- **State**: `{ fen }` — FEN carries side-to-move, castling rights, en passant,
  move counters. Backed by `packages/engines/chess` (our `lib-chess.js`).
- **Actions**: `{ type: "MOVE", from: "e2", to: "e4", promotion?: "q" }`.
  `RESIGN` is not an engine action — resign/forfeit is session-level, produces
  `GAME_END` directly.
- **Events**: one per move — `{ type: "move", from, to, piece, captured?,
  promotion?, check?, checkmate? }`.
- **Turn**: encoded in state; `applyAction` from the wrong side →
  `NOT_YOUR_TURN` → gateway emits `ERROR`. No turn logic in gateway code.
- **Colors**: `config.seatColors = { 0: "w", 1: "b" }`, randomized at start
  (fairness), engine-authoritative.
- **Draws**: stalemate, 50-move, threefold — engine reports `gameOver: true,
  result: { winner: null, reason: "draw" }`. No clocks, no draw offers in v1.

## Hidden information (future, hook exists)

`viewFor(state, seat)` projects the authoritative state per seat; the gateway
broadcasts the projection, not the truth. Actions validate against full state.
Not exercised by chess/ludo (identity function); built for Uno/Poker/etc.

## Persistence tie-in

- `match_events` — append-only event log; animated replay after `ARCHIVED`.
- `matches.final_state` — final JSONB snapshot; instant history rendering.
- See `persistence.md`.