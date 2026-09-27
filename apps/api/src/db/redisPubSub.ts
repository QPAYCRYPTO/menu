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

// Aynı kanalı birden fazla SSE bağlantısı (admin + garson sekmeleri) paylaşır.
// Redis'te subscribe bağlantı başına tektir → son dinleyici kapanınca unsubscribe edilir.
const channelRefCounts = new Map<string, number>();

export function subscribeChannel(channel: string, callback: (err?: Error | null) => void): void {
  const count = (channelRefCounts.get(channel) ?? 0) + 1;
  channelRefCounts.set(channel, count);
  if (count === 1) {
    subscriber.subscribe(channel, (err) => callback(err));
  } else {
    callback(null);
  }
}

export function unsubscribeChannel(channel: string): void {
  const count = (channelRefCounts.get(channel) ?? 0) - 1;
  if (count > 0) {
    channelRefCounts.set(channel, count);
    return;
  }
  channelRefCounts.delete(channel);
  subscriber.unsubscribe(channel).catch(() => {});
}

// Admin'e bildirim gönder
export async function publishOrder(businessId: string, payload: object): Promise<void> {
  await publisher.publish(`${ORDER_CHANNEL}:${businessId}`, JSON.stringify(payload));
}