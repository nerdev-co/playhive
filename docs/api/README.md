# PlayHive API Documentation

Generated with TypeDoc from source code.

## Available Documentation

| Package | Description | Link |
|---------|-------------|------|
| **protocol** | Core message types, envelopes, validation schemas | [protocol/index.html](protocol/index.html) |
| **ludo-engine** | Game engine: init, applyAction, legalActions, chooseBotAction | [ludo-engine/index.html](ludo-engine/index.html) |
| **ws-gateway** | WebSocket gateway: connection handling, message routing, room management | [ws-gateway/index.html](ws-gateway/index.html) |

## Not Generated (Type Dependencies)

| Package | Issue |
|---------|-------|
| **be (HTTP API)** | Missing `@types/bun`, Prisma Temporal types |
| **db** | Prisma ORM types require `@js-temporal/polyfill`, import attributes |

## Generate Locally

```bash
# From project root
bunx typedoc --out docs/api/protocol --entryPoints packages/protocol/index.ts
bunx typedoc --out docs/api/ludo-engine --entryPoints packages/engines/ludo/src/index.ts
bunx typedoc --out docs/api/ws-gateway --entryPoints apps/ws-gateway/index.ts
```

## Quick Reference

### Protocol
- `Envelope<T>` - Base message wrapper
- `ClientMessageType` / `ServerMessageType` - All message types
- `createEnvelope()`, `validateEnvelope()`, `parseEnvelope()`
- Zod schemas: `ClientPayloadSchemas`, `ServerPayloadSchemas`

### Ludo Engine
- `createInitialState(settings)` → `EngineState`
- `applyAction(state, seat, action)` → `{ events, state, gameOver, result }`
- `legalActions(state, seat)` → `EngineAction[]`
- `chooseBotAction(state, seat)` → `EngineAction`

### WS Gateway
- `handleConnection(ws)` - Main connection handler
- Handlers: `auth`, `rooms`, `players`, `game`, `dispatcher`
- Room lifecycle: `WAITING → STARTING → IN_PROGRESS → FINISHED → ARCHIVED`