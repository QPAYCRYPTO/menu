// apps/api/src/db/redisPubSub.ts
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

// Publisher — sipariş gelince buraya publish edilir
export const publisher = new Redis(env.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true
});

// Subscriber — SSE handler buradan dinler
export const subscriber = new Redis(env.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true
});

export const ORDER_CHANNEL = 'new_order';

// Admin'e bildirim gönder
export async function publishOrder(businessId: string, payload: object): Promise<void> {
  await publisher.publish(`${ORDER_CHANNEL}:${businessId}`, JSON.stringify(payload));
}