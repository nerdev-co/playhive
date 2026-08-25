import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err);
});

export async function connectRedis() {
  if (redis.status === 'wait') {
    await redis.connect();
  }
}

export async function disconnectAll() {
  await prisma.$disconnect();
  await redis.quit();
}