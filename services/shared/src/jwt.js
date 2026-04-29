import jwt from 'jsonwebtoken';
import { AppError } from './errors.js';

export function signAccessToken(user) {
  return jwt.sign(
    {
      email: user.email,
      username: user.username
    },
    process.env.JWT_SECRET,
    {
      subject: user.id,
      expiresIn: process.env.JWT_ACCESS_TTL ?? '2h'
    }
  );
}

export function verifyAccessToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  return {
    id: decoded.sub,
    email: decoded.email,
    username: decoded.username
  };
}

export function authMiddleware(req, _res, next) {
  const header = req.header('authorization') ?? '';
  const [, token] = header.match(/^Bearer\s+(.+)$/i) ?? [];

  if (!token) {
    next(new AppError(401, 'UNAUTHORIZED', 'Bearer token is required'));
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError(401, 'INVALID_TOKEN', 'JWT access token is invalid or expired'));
  }
}
