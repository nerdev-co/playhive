# PlayMesh Engine Contract

How game engines plug into the gateway. One interface, many games; chess and
ludo implement it, Uno/Poker/etc. are drop-in later.

## Permission split

Three kinds of permission, three layers:

| Permission                               | Owner                  | Examples                                           |
| ---------------------------------------- | ---------------------- | -------------------------------------------------- |
| Identity (may this connection act here?) | **Gateway/session**    | seated + authed + room `IN_PROGRESS`               |
| Turn + legality (is this action valid?)  | **Engine**             | chess: it's white's move; ludo: token can move 4   |
| Visibility (what may this seat see?)     | **Engine** (`viewFor`) | chess/ludo: everything; Uno/poker: projected views |

Rule: the gateway never validates game rules, and the engine never sees the
room. They meet only at actions and events.

## Interface (`packages/engines/core`)

```ts
interface GameEngine {
  readonly id: string; // "chess", "ludo", ...
  readonly displayName: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  createInitialState(config: EngineConfig, seats: number[]): GameState;
  // GameState is opaque JSON to the gateway. Must be plain serializable data
  // (no class instances, no functions) — it travels in envelopes and the DB.

  applyAction(
    state: GameState,
    seat: number,
    action: EngineAction,
  ): ApplyResult;
  // throws EngineError { code: "NOT_YOUR_TURN" | "INVALID_ACTION" | ... }
  // ApplyResult = { events: GameEvent[], state: GameState, gameOver: boolean, result?: MatchResult }

  legalActions(state: GameState, seat: number): EngineAction[]; // UI hints + bot input
  canAct(state: GameState, seat: number): boolean; // cheap turn check

  chooseBotAction(state: GameState, seat: number): EngineAction | null;

  viewFor?(state: GameState, seat: number): GameState; // hidden-info games only
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
- Outcomes are recorded _in the events_ (a dice value is an event), so
  replay/rebuild is deterministic — no RNG replay problem.

## Bots

**Bots play to win. Period.** Single policy in v1, no difficulty knob:

- Chess: minimax with alpha-beta pruning, depth bounded by latency (~2–4).
- Ludo: optimal move given the roll.
- The gateway schedules bot turns with a small think delay (~700ms) so human
  opponents don't see instant teleporting moves.
- Policy: after each settled action, the session loops — _whose turn? still a
  bot? → think → act_ — with a hard iteration cap so nothing can loop forever.

## Chess (reference implementation)

Backed by `packages/engines/chess` (our `lib-chess.js`). Deterministic — no
RNG anywhere, so event-log replay rebuilds state exactly.

### State representation

- **In-memory truth**: `{ board, turn, castling, ep, halfmove, fullmove }`
  where `board` is a **flat 64 array** of `(Piece | null)[]`, `Piece = {
type, color }`.
- FEN is an **import/export format**, not the state: FEN → 64-array on
  `createInitialState`/resume; 64-array → FEN for history display and
  `matches.final_state` (still plain JSON — satisfies the opaque-state
  contract).
- Indexing: `a1 = 0`, files `a-h` → `0-7`, ranks `1-8` → `rank*8 + file`
  (rank 1 = index 0, rank 8 = 56..63). `index % 8` = file, `floor(index / 8)`
  = rank.
- Conversion: `squareToIndex("e4") = (4-1)*8 + ('e'-'a') = 28`;
  `indexToSquare(28) = "e4"`.

### Move generation

- **No stored domains.** Legal moves are generated lazily per query — never
  cached on pieces, never precomputed after a turn. Two-stage filter:
  1. **Pseudo-legal** — piece-rule moves, minus own-piece captures.
  2. **Legal** — simulate each, keep only moves where the mover's king is not
     attacked afterward (this is what makes pinned pieces behave and prevents
     moving into check).
- **Sliding pieces** (rook/bishop/queen): walk each direction until edge or
  piece — capture if enemy, stop; blocked if own.
- **Fixed offsets** (knight/king): enumerate offsets, keep in-bounds +
  file-valid + not own piece.
- **Direction offsets**: +8 up, −8 down, ±1 horizontal, ±7/±9 diagonals.
- **THE file-boundary guard** (the classic hand-code bug): from h1 (7), `+1`
  = 8 which is a2 — looks legal, isn't. Never trust raw `index ± n` alone:
  compute the target file from `index % 8` and verify the file delta
  (horizontal/diagonal ≤ 1, knight ≤ 2) before accepting the step.
- **Pawn**: forward blocked by any piece; captures diagonally only onto enemy;
  double-step from start rank; promotion with choice; en passant.

### Special rules (each has a trap)

- **Castling** — needs _both_: unmoved king+rook and empty squares _and_ the
  king not in, through, or into an attacked square. The attacked-square check
  is the same primitive as check detection.
- **En passant** — the captured pawn is **not on the landing square**; it's one
  rank back. The event must say so explicitly
  (`captured: { square: "e5", by: "ep" }`) or replays diverge.
- **Promotion** — the client chooses the piece; the `MOVE` **action** carries
  `promotion` and the **event** records it, or replay diverges from live play.
- **Draws** — stalemate, 50-move, threefold: `gameOver: true, result: {
winner: null, reason: "draw" }`. Checkmate: `winner` = opponent, `reason:
"checkmate"`.

### Contract mapping

- **State**: the 64-array object above (JSON-serializable).
- **Actions**: `{ type: "MOVE", from: "e2", to: "e4", promotion?: "q" }`.
  `RESIGN` is not an engine action — resign/forfeit is session-level, produces
  `GAME_END` directly.
- **Events**: one per move — `{ type: "move", from, to, piece, captured?,
promotion?, check?, checkmate? }`.
- **Turn**: encoded in state; `applyAction` from the wrong side →
  `NOT_YOUR_TURN` → gateway emits `ERROR`. No turn logic in gateway code.
- **Colors**: `config.seatColors = { 0: "w", 1: "b" }`, randomized at start
  (fairness), engine-authoritative.
- **Client mirror**: `apps/web` runs the same engine for legal-move highlights
  and pre-validation (UX only) — never authority. Server validates regardless.

## Hidden information (future, hook exists)

`viewFor(state, seat)` projects the authoritative state per seat; the gateway
broadcasts the projection, not the truth. Actions validate against full state.
Not exercised by chess/ludo (identity function); built for Uno/Poker/etc.

## Persistence tie-in

- `match_events` — append-only event log; animated replay after `ARCHIVED`.
- `matches.final_state` — final JSONB snapshot; instant history rendering.
- See `persistence.md`.
