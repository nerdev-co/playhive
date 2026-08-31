import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
redis.connect().catch(console.error);

export function getRedisClient() {
  return redis;
}

export const RedisKeys = {
  presence: (playerId: string) => `presence:${playerId}`,
  queue: (game: string) => `queue:${game}`,
  dedup: (playerId: string) => `dedup:${playerId}`,
  roomGateway: (roomId: string) => `room:${roomId}:gateway`,
  playerGateway: (playerId: string) => `player:${playerId}:gateway`,
} as const;

export const PresenceTTL = 90;
export const DedupTTL = 300;
export const GatewayTTL = 90;

export async function setPresence(playerId: string, data: { status: string; roomId?: string }) {
  await redis.setEx(RedisKeys.presence(playerId), PresenceTTL, JSON.stringify(data));
}

export async function getPresence(playerId: string) {
  const data = await redis.get(RedisKeys.presence(playerId));
  return data ? JSON.parse(data) : null;
}

export async function removePresence(playerId: string) {
  await redis.del(RedisKeys.presence(playerId));
}

export async function addToQueue(game: string, playerId: string, score: number) {
  await redis.zAdd(RedisKeys.queue(game), { score, value: playerId });
}

export async function removeFromQueue(game: string, playerId: string) {
  await redis.zRem(RedisKeys.queue(game), playerId);
}

export async function getQueueOldest(game: string, count: number) {
  return redis.zRange(RedisKeys.queue(game), 0, count - 1);
}

export async function getQueueRank(game: string, playerId: string) {
  return redis.zRank(RedisKeys.queue(game), playerId);
}

export async function addDedup(playerId: string, requestId: string) {
  const key = RedisKeys.dedup(playerId);
  const now = Date.now();
  await redis.zAdd(key, { score: now, value: requestId });
  await redis.expire(key, DedupTTL);
}

export async function checkDedup(playerId: string, requestId: string) {
  const key = RedisKeys.dedup(playerId);
  const score = await redis.zScore(key, requestId);
  return score !== null;
}

export async function setRoomGateway(roomId: string, gatewayId: string) {
  await redis.setEx(RedisKeys.roomGateway(roomId), GatewayTTL, gatewayId);
}

export async function getRoomGateway(roomId: string) {
  return redis.get(RedisKeys.roomGateway(roomId));
}

export async function removeRoomGateway(roomId: string) {
  await redis.del(RedisKeys.roomGateway(roomId));
}

export async function setPlayerGateway(playerId: string, gatewayId: string) {
  await redis.setEx(RedisKeys.playerGateway(playerId), GatewayTTL, gatewayId);
}

export async function getPlayerGateway(playerId: string) {
  return redis.get(RedisKeys.playerGateway(playerId));
}

export async function removePlayerGateway(playerId: string) {
  await redis.del(RedisKeys.playerGateway(playerId));
}