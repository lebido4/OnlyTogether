import bcrypt from 'bcryptjs';
import cors from 'cors';
import express from 'express';
import http from 'node:http';
import {
  AppError,
  asyncHandler,
  authMiddleware,
  createShutdownManager,
  createDbPool,
  createLogger,
  createRedisConnection,
  errorHandler,
  notFoundHandler,
  publishEvent,
  queryOne,
  requestContext,
  requireString,
  signAccessToken,
  validateEmail
} from '@onlytogether/shared';

const app = express();
const server = http.createServer(app);
const logger = createLogger('auth-service');
const db = createDbPool();
const redis = await createRedisConnection(logger);
const shutdown = createShutdownManager({
  server,
  logger,
  resources: [
    { name: 'postgres', close: () => db.end() },
    { name: 'redis', close: () => (redis.isOpen ? redis.quit() : undefined) }
  ]
});

app.use(requestContext(logger));
app.use(shutdown.middleware);
app.use(cors({ origin: process.env.FRONTEND_URL ?? true, credentials: true }));
app.use(express.json());

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at
  };
}

app.get('/health', (_req, res) => {
  res.json({ service: 'auth-service', status: 'ok' });
});

app.post(
  '/auth/register',
  asyncHandler(async (req, res) => {
    const email = validateEmail(requireString(req.body, 'email', { min: 5, max: 255 }));
    const username = requireString(req.body, 'username', { min: 2, max: 40 });
    const password = requireString(req.body, 'password', { min: 8, max: 128 });
    const passwordHash = await bcrypt.hash(password, 12);

    let user;
    try {
      user = await queryOne(
        db,
        `INSERT INTO users (email, username, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, username, is_admin, created_at`,
        [email, username, passwordHash]
      );
    } catch (error) {
      if (error.code === '23505') {
        throw new AppError(409, 'USER_ALREADY_EXISTS', 'User with this email or username already exists');
      }
      throw error;
    }

    await publishEvent(redis, 'auth:user_registered', {
      userId: user.id,
      email: user.email,
      username: user.username
    });

    res.status(201).json({
      user: mapUser(user),
      accessToken: signAccessToken(user)
    });
  })
);

app.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const email = validateEmail(requireString(req.body, 'email', { min: 5, max: 255 }));
    const password = requireString(req.body, 'password', { min: 1, max: 128 });
    logger.info({ requestId: req.requestId, pid: process.pid }, 'Login attempt received');
    const user = await queryOne(
      db,
      'SELECT id, email, username, password_hash, is_admin, created_at FROM users WHERE email = $1',
      [email]
    );

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    
    res.json({
      user: mapUser(user),
      accessToken: signAccessToken(user)
    });
  })
);

app.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = await queryOne(
      db,
      'SELECT id, email, username, is_admin, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');
    }

    res.json({ user: mapUser(user) });
  })
);

app.use(notFoundHandler);
app.use(errorHandler(logger));

const port = Number(process.env.AUTH_SERVICE_PORT ?? 3001);
server.listen(port, () => logger.info({ port }, 'Auth service started'));
