import crypto from 'node:crypto';
import { AppError } from './errors.js';

const REQUEST_ID_HEADER = 'x-request-id';

export function createRequestId() {
  return crypto.randomUUID();
}

export function getRequestId(req) {
  return req.requestId ?? req.header?.(REQUEST_ID_HEADER);
}

export function requestContext(logger) {
  return (req, res, next) => {
    const requestId = req.header(REQUEST_ID_HEADER) || createRequestId();
    const startedAt = process.hrtime.bigint();

    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    logger.info(
      {
        requestId,
        method: req.method,
        path: req.originalUrl ?? req.url,
        remoteAddress: req.ip
      },
      'HTTP request started'
    );

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const payload = {
        requestId,
        method: req.method,
        path: req.originalUrl ?? req.url,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2))
      };

      const message = 'HTTP request completed';
      if (res.statusCode >= 500) {
        logger.error(payload, message);
      } else {
        logger.info(payload, message);
      }
    });

    next();
  };
}

export function requireInternalApiKey(req, _res, next) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    next(new AppError(500, 'INTERNAL_KEY_NOT_CONFIGURED', 'Internal API key is not configured'));
    return;
  }

  if (req.header('x-internal-api-key') !== expected) {
    next(new AppError(401, 'UNAUTHORIZED_INTERNAL_REQUEST', 'Invalid internal API key'));
    return;
  }

  next();
}

export function getTrustedUser(req) {
  return {
    id: req.header('x-user-id'),
    email: req.header('x-user-email'),
    username: req.header('x-user-username')
  };
}
