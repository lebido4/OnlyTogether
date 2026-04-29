import http from 'node:http';
import axios from 'axios';
import cors from 'cors';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import {
  asyncHandler,
  authMiddleware,
  createLogger,
  errorHandler,
  notFoundHandler
} from '@watchparty/shared';

const app = express();
const server = http.createServer(app);
const logger = createLogger('api-gateway');

const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://auth-service:3001';
const roomServiceUrl = process.env.ROOM_SERVICE_URL ?? 'http://room-service:3002';
const chatServiceUrl = process.env.CHAT_SERVICE_URL ?? 'http://chat-service:3003';
const realtimeServiceUrl = process.env.REALTIME_SERVICE_URL ?? 'http://realtime-service:3004';

app.use(cors({ origin: process.env.FRONTEND_URL ?? true, credentials: true }));

function buildHeaders(req) {
  const headers = {
    authorization: req.header('authorization') ?? '',
    'content-type': req.header('content-type') ?? 'application/json'
  };

  if (req.user) {
    headers['x-user-id'] = req.user.id;
    headers['x-user-email'] = req.user.email;
    headers['x-user-username'] = req.user.username;
  }

  return headers;
}

function forwardTo(targetBase) {
  return asyncHandler(async (req, res) => {
    const response = await axios.request({
      method: req.method,
      url: `${targetBase}${req.originalUrl}`,
      data: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      headers: buildHeaders(req),
      validateStatus: () => true
    });

    res.status(response.status).send(response.data);
  });
}

const socketProxy = createProxyMiddleware('/socket.io', {
  target: realtimeServiceUrl,
  changeOrigin: true,
  ws: true,
  logLevel: 'warn'
});

app.use(socketProxy);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    service: 'api-gateway',
    status: 'ok',
    upstreams: {
      authServiceUrl,
      roomServiceUrl,
      chatServiceUrl,
      realtimeServiceUrl
    }
  });
});

app.post('/auth/register', forwardTo(authServiceUrl));
app.post('/auth/login', forwardTo(authServiceUrl));

app.get('/me', authMiddleware, forwardTo(authServiceUrl));

app.get('/rooms/:id/messages', authMiddleware, forwardTo(chatServiceUrl));
app.post('/rooms/:id/messages', authMiddleware, forwardTo(chatServiceUrl));
app.use('/rooms', authMiddleware, forwardTo(roomServiceUrl));

app.use(notFoundHandler);
app.use(errorHandler(logger));

server.on('upgrade', socketProxy.upgrade);

const port = Number(process.env.API_GATEWAY_PORT ?? 8080);
server.listen(port, () => logger.info({ port }, 'API gateway started'));
