import { AppError } from './errors.js';

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
