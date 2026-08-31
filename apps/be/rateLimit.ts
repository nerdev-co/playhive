import { getRedisClient } from "@playhive/db";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULTS: Record<string, RateLimitConfig> = {
  auth: { windowMs: 60_000, maxRequests: 10 },
  rooms: { windowMs: 60_000, maxRequests: 30 },
  matches: { windowMs: 60_000, maxRequests: 60 },
  queue: { windowMs: 60_000, maxRequests: 20 },
  default: { windowMs: 60_000, maxRequests: 60 },
};

export function bucketFor(path: string): string {
  if (path.startsWith("/auth")) return "auth";
  if (path.startsWith("/rooms")) return "rooms";
  if (path.startsWith("/matches")) return "matches";
  if (path.startsWith("/queue")) return "queue";
  return "default";
}

export async function checkRateLimit(
  key: string,
  bucket: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const config: RateLimitConfig = (DEFAULTS[bucket] ?? DEFAULTS.default)!;
  const redisKey = `rl:${bucket}:${key}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const resetAt = Math.ceil((now + config.windowMs) / 1000);

  try {
    const redis = getRedisClient();
    const pipe = redis.multi();
    pipe.zRemRangeByScore(redisKey, 0, windowStart);
    pipe.zAdd(redisKey, { score: now, value: `${now}` });
    pipe.zCard(redisKey);
    pipe.expire(redisKey, Math.ceil(config.windowMs / 1000));
    const results = await pipe.exec();

    const count = Number(results[2]);
    const remaining = Math.max(0, config.maxRequests - count);
    const allowed = count <= config.maxRequests;

    return { allowed, remaining, resetAt };
  } catch {
    return { allowed: true, remaining: config.maxRequests, resetAt };
  }
}

export function rateLimitHeaders(remaining: number, resetAt: number): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetAt),
  };
}
