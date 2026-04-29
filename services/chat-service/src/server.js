import cors from 'cors';
import express from 'express';
import {
  AppError,
  asyncHandler,
  authMiddleware,
  createDbPool,
  createLogger,
  createRedisConnection,
  errorHandler,
  notFoundHandler,
  publishEvent,
  queryOne,
  requireInternalApiKey,
  requireString,
  subscribeEvents
} from '@watchparty/shared';

const app = express();
const logger = createLogger('chat-service');
const db = createDbPool();
const redis = await createRedisConnection(logger);

app.use(cors({ origin: process.env.FRONTEND_URL ?? true, credentials: true }));
app.use(express.json());

function mapMessage(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    type: row.type,
    content: row.content,
    createdAt: row.created_at,
    user: row.user_id
      ? {
          id: row.user_id,
          username: row.username
        }
      : null
  };
}

async function assertActiveMember(roomId, userId) {
  const member = await queryOne(
    db,
    'SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2 AND is_active = TRUE',
    [roomId, userId]
  );

  if (!member) {
    throw new AppError(403, 'ROOM_MEMBERSHIP_REQUIRED', 'Join the room before reading or sending messages');
  }
}

async function createMessage({ roomId, userId = null, type, content }) {
  const row = await queryOne(
    db,
    `WITH inserted AS (
       INSERT INTO messages (room_id, user_id, type, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *
     )
     SELECT inserted.*, u.username
       FROM inserted
       LEFT JOIN users u ON u.id = inserted.user_id`,
    [roomId, userId, type, content]
  );

  const message = mapMessage(row);
  await publishEvent(redis, 'chat:message_sent', {
    roomId,
    message
  });
  return message;
}

app.get('/health', (_req, res) => {
  res.json({ service: 'chat-service', status: 'ok' });
});

app.post(
  '/internal/rooms/:id/messages',
  requireInternalApiKey,
  asyncHandler(async (req, res) => {
    const userId = requireString(req.body, 'userId', { min: 20, max: 80 });
    const content = requireString(req.body, 'content', { min: 1, max: 2000 });

    await assertActiveMember(req.params.id, userId);
    const message = await createMessage({
      roomId: req.params.id,
      userId,
      type: 'user',
      content
    });

    res.status(201).json({ message });
  })
);

app.use(authMiddleware);

app.get(
  '/rooms/:id/messages',
  asyncHandler(async (req, res) => {
    await assertActiveMember(req.params.id, req.user.id);

    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const rows = (
      await db.query(
        `SELECT m.*, u.username
           FROM messages m
           LEFT JOIN users u ON u.id = m.user_id
          WHERE m.room_id = $1
          ORDER BY m.created_at DESC
          LIMIT $2`,
        [req.params.id, limit]
      )
    ).rows;

    res.json({ messages: rows.reverse().map(mapMessage) });
  })
);

app.post(
  '/rooms/:id/messages',
  asyncHandler(async (req, res) => {
    const content = requireString(req.body, 'content', { min: 1, max: 2000 });
    await assertActiveMember(req.params.id, req.user.id);

    const message = await createMessage({
      roomId: req.params.id,
      userId: req.user.id,
      type: 'user',
      content
    });

    res.status(201).json({ message });
  })
);

await subscribeEvents(
  ['room:user_joined', 'room:user_left'],
  async (event) => {
    const { roomId, user } = event.payload;
    if (!roomId || !user?.username) {
      return;
    }

    const content =
      event.type === 'room:user_joined'
        ? `${user.username} joined the room`
        : `${user.username} left the room`;

    await createMessage({
      roomId,
      type: 'system',
      content
    });
  },
  logger
);

app.use(notFoundHandler);
app.use(errorHandler(logger));

const port = Number(process.env.CHAT_SERVICE_PORT ?? 3003);
app.listen(port, () => logger.info({ port }, 'Chat service started'));
