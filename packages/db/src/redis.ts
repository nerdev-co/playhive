import { redis } from './index';

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
  await redis.setex(RedisKeys.presence(playerId), PresenceTTL, JSON.stringify(data));
}

export async function getPresence(playerId: string) {
  const data = await redis.get(RedisKeys.presence(playerId));
  return data ? JSON.parse(data) : null;
}

export async function removePresence(playerId: string) {
  await redis.del(RedisKeys.presence(playerId));
}

export async function addToQueue(game: string, playerId: string, score: number) {
  await redis.zadd(RedisKeys.queue(game), score, playerId);
}

export async function removeFromQueue(game: string, playerId: string) {
  await redis.zrem(RedisKeys.queue(game), playerId);
}

export async function getQueueOldest(game: string, count: number) {
  return redis.zrange(RedisKeys.queue(game), 0, count - 1);
}

export async function getQueueRank(game: string, playerId: string) {
  return redis.zrank(RedisKeys.queue(game), playerId);
}

export async function addDedup(playerId: string, requestId: string) {
  const key = RedisKeys.dedup(playerId);
  const now = Date.now();
  await redis.zadd(key, now, requestId);
  await redis.expire(key, DedupTTL);
}

export async function checkDedup(playerId: string, requestId: string) {
  const key = RedisKeys.dedup(playerId);
  const score = await redis.zscore(key, requestId);
  return score !== null;
}

export async function setRoomGateway(roomId: string, gatewayId: string) {
  await redis.setex(RedisKeys.roomGateway(roomId), GatewayTTL, gatewayId);
}

export async function getRoomGateway(roomId: string) {
  return redis.get(RedisKeys.roomGateway(roomId));
}

export async function removeRoomGateway(roomId: string) {
  await redis.del(RedisKeys.roomGateway(roomId));
}

export async function setPlayerGateway(playerId: string, gatewayId: string) {
  await redis.setex(RedisKeys.playerGateway(playerId), GatewayTTL, gatewayId);
}

export async function getPlayerGateway(playerId: string) {
  return redis.get(RedisKeys.playerGateway(playerId));
}

export async function removePlayerGateway(playerId: string) {
  await redis.del(RedisKeys.playerGateway(playerId));
}