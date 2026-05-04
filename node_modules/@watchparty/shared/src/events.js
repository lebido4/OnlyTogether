import { createClient } from 'redis';

export async function createRedisConnection(logger) {
  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (error) => logger.error({ error }, 'Redis error'));
  await client.connect();
  return client;
}

export async function publishEvent(redis, type, payload) {
  const envelope = {
    type,
    payload,
    occurredAt: new Date().toISOString()
  };

  await redis.publish(type, JSON.stringify(envelope));

  try {
    await redis.xAdd('onlytogether:events', '*', {
      type,
      occurredAt: envelope.occurredAt,
      payload: JSON.stringify(payload)
    });
  } catch {
    // Pub/sub is the primary path for MVP; stream persistence is best-effort.
  }

  return envelope;
}

export async function subscribeEvents(types, handler, logger) {
  const subscriber = createClient({ url: process.env.REDIS_URL });
  subscriber.on('error', (error) => logger.error({ error }, 'Redis subscriber error'));
  await subscriber.connect();

  await Promise.all(
    types.map((type) =>
      subscriber.subscribe(type, async (message) => {
        try {
          await handler(JSON.parse(message));
        } catch (error) {
          logger.error({ error, type }, 'Failed to handle event');
        }
      })
    )
  );

  return subscriber;
}
