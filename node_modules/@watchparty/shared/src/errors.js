export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} was not found`));
}

export function errorHandler(logger) {
  return (error, _req, res, _next) => {
    const status = error.status ?? 500;
    const code = error.code ?? 'INTERNAL_ERROR';

    if (status >= 500) {
      logger.error({ error }, error.message);
    } else {
      logger.warn({ error }, error.message);
    }

    res.status(status).json({
      error: {
        code,
        message: status >= 500 ? 'Internal server error' : error.message,
        details: error.details
      }
    });
  };
}
