import http from 'node:http';
import axios from 'axios';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import {
  createLogger,
  createRedisConnection,
  subscribeEvents,
  verifyAccessToken
} from '@watchparty/shared';

const app = express();
const server = http.createServer(app);
const logger = createLogger('realtime-service');
const redis = await createRedisConnection(logger);

const roomServiceUrl = process.env.ROOM_SERVICE_URL ?? 'http://room-service:3002';
const chatServiceUrl = process.env.CHAT_SERVICE_URL ?? 'http://chat-service:3003';
const internalHeaders = { 'x-internal-api-key': process.env.INTERNAL_API_KEY };

app.use(cors({ origin: process.env.FRONTEND_URL ?? true, credentials: true }));
app.get('/health', (_req, res) => {
  res.json({ service: 'realtime-service', status: 'ok' });
});

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL ?? true,
    credentials: true
  }
});

io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token ??
    socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (!token) {
    next(new Error('JWT token is required'));
    return;
  }

  try {
    socket.data.token = token;
    socket.data.user = verifyAccessToken(token);
    socket.data.rooms = new Set();
    next();
  } catch {
    next(new Error('JWT token is invalid or expired'));
  }
});

function roomChannel(roomId) {
  return `room:${roomId}`;
}

function usersKey(roomId) {
  return `presence:room:${roomId}:users`;
}

function userSocketsKey(roomId, userId) {
  return `presence:room:${roomId}:user:${userId}:sockets`;
}

async function addPresence(roomId, userId, socketId) {
  await redis.sAdd(usersKey(roomId), userId);
  await redis.sAdd(userSocketsKey(roomId, userId), socketId);
  await redis.expire(usersKey(roomId), 86400);
  await redis.expire(userSocketsKey(roomId, userId), 86400);
}

async function removePresence(roomId, userId, socketId) {
  await redis.sRem(userSocketsKey(roomId, userId), socketId);
  const remaining = await redis.sCard(userSocketsKey(roomId, userId));

  if (remaining === 0) {
    await redis.sRem(usersKey(roomId), userId);
  }
}

async function broadcastPresence(roomId) {
  const userIds = await redis.sMembers(usersKey(roomId));
  io.to(roomChannel(roomId)).emit('presence:updated', {
    roomId,
    userIds,
    count: userIds.length
  });
}

async function verifyRoomAccess(socket, roomId) {
  await axios.get(`${roomServiceUrl}/rooms/${roomId}`, {
    headers: { authorization: `Bearer ${socket.data.token}` }
  });
}

async function emitSyncCommand(socket, action, payload, ack) {
  try {
    const roomId = String(payload?.roomId ?? '');
    const positionSec = Number(payload?.positionSec ?? 0);

    if (!roomId || !Number.isFinite(positionSec)) {
      throw new Error('roomId and positionSec are required');
    }

    const response = await axios.post(
      `${roomServiceUrl}/internal/rooms/${roomId}/state`,
      {
        userId: socket.data.user.id,
        username: socket.data.user.username,
        action,
        positionSec
      },
      { headers: internalHeaders }
    );

    ack?.({ ok: true, payload: response.data });
  } catch (error) {
    const message = error.response?.data?.error?.message ?? error.message;
    ack?.({ ok: false, error: message });
    socket.emit('sync:error', { message });
  }
}

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id, userId: socket.data.user.id }, 'Socket connected');

  socket.on('room:join', async (payload, ack) => {
    try {
      const roomId = String(payload?.roomId ?? '');
      if (!roomId) {
        throw new Error('roomId is required');
      }

      await verifyRoomAccess(socket, roomId);
      socket.join(roomChannel(roomId));
      socket.data.rooms.add(roomId);

      await addPresence(roomId, socket.data.user.id, socket.id);
      await broadcastPresence(roomId);

      ack?.({ ok: true });
    } catch (error) {
      const message = error.response?.data?.error?.message ?? error.message;
      ack?.({ ok: false, error: message });
      socket.emit('room:error', { message });
    }
  });

  socket.on('room:leave', async (payload, ack) => {
    const roomId = String(payload?.roomId ?? '');
    if (roomId) {
      socket.leave(roomChannel(roomId));
      socket.data.rooms.delete(roomId);
      await removePresence(roomId, socket.data.user.id, socket.id);
      await broadcastPresence(roomId);
    }
    ack?.({ ok: true });
  });

  socket.on('chat:send_message', async (payload, ack) => {
    try {
      const roomId = String(payload?.roomId ?? '');
      const content = String(payload?.content ?? '').trim();

      if (!roomId || !content) {
        throw new Error('roomId and content are required');
      }

      const response = await axios.post(
        `${chatServiceUrl}/internal/rooms/${roomId}/messages`,
        {
          userId: socket.data.user.id,
          content
        },
        { headers: internalHeaders }
      );

      ack?.({ ok: true, payload: response.data });
    } catch (error) {
      const message = error.response?.data?.error?.message ?? error.message;
      ack?.({ ok: false, error: message });
      socket.emit('chat:error', { message });
    }
  });

  socket.on('sync:video_play', (payload, ack) => emitSyncCommand(socket, 'play', payload, ack));
  socket.on('sync:video_pause', (payload, ack) => emitSyncCommand(socket, 'pause', payload, ack));
  socket.on('sync:video_seek', (payload, ack) => emitSyncCommand(socket, 'seek', payload, ack));
  socket.on('sync:video_stop', (payload, ack) => emitSyncCommand(socket, 'stop', payload, ack));

  socket.on('disconnect', async () => {
    for (const roomId of socket.data.rooms) {
      await removePresence(roomId, socket.data.user.id, socket.id);
      await broadcastPresence(roomId);
    }
    logger.info({ socketId: socket.id, userId: socket.data.user.id }, 'Socket disconnected');
  });
});

await subscribeEvents(
  ['chat:message_sent', 'sync:state_updated', 'room:user_joined', 'room:user_left'],
  async (event) => {
    const roomId = event.payload?.roomId;
    if (!roomId) {
      return;
    }

    io.to(roomChannel(roomId)).emit(event.type, event.payload);
  },
  logger
);

const port = Number(process.env.REALTIME_SERVICE_PORT ?? 3004);
server.listen(port, () => logger.info({ port }, 'Realtime service started'));
