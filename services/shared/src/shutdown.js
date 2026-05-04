const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10000;
const DEFAULT_REJECT_WINDOW_MS = 1500;

function toPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function requestPath(req) {
  return req.originalUrl ?? req.url;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close((error) => {
      resolve(error);
    });
  });
}

async function closeResource(resource, logger) {
  const name = resource.name ?? 'resource';
  try {
    await resource.close();
    logger.info({ resource: name }, 'Shutdown resource closed');
  } catch (error) {
    logger.error({ resource: name, error }, 'Shutdown resource close failed');
  }
}

export function createShutdownManager({
  server,
  logger,
  resources = [],
  timeoutMs = toPositiveNumber(process.env.SHUTDOWN_TIMEOUT_MS, DEFAULT_SHUTDOWN_TIMEOUT_MS),
  rejectNewRequestsForMs = toPositiveNumber(
    process.env.SHUTDOWN_REJECT_WINDOW_MS,
    DEFAULT_REJECT_WINDOW_MS
  )
}) {
  let shuttingDown = false;
  let shutdownStarted = false;
  let activeRequests = 0;
  const sockets = new Set();
  const waiters = new Set();

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => {
      sockets.delete(socket);
    });
  });

  function resolveWaitersIfIdle() {
    if (activeRequests > 0) {
      return;
    }

    for (const resolve of waiters) {
      resolve();
    }
    waiters.clear();
  }

  function waitForActiveRequests() {
    if (activeRequests === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      waiters.add(resolve);
    });
  }

  function trackRequest(res) {
    activeRequests += 1;
    let released = false;

    function release() {
      if (released) {
        return;
      }

      released = true;
      activeRequests = Math.max(0, activeRequests - 1);
      resolveWaitersIfIdle();
    }

    res.once('finish', release);
    res.once('close', release);
  }

  function middleware(req, res, next) {
    if (shuttingDown) {
      logger.info(
        {
          requestId: req.requestId,
          method: req.method,
          path: requestPath(req),
          statusCode: 503
        },
        'HTTP request rejected during shutdown'
      );

      res.setHeader('Connection', 'close');
      res.status(503).json({
        error: {
          code: 'SERVICE_SHUTTING_DOWN',
          message: 'Service is shutting down',
          requestId: req.requestId
        }
      });
      return;
    }

    trackRequest(res);
    next();
  }

  async function shutdown(signal) {
    if (shutdownStarted) {
      logger.info({ signal }, 'Shutdown already in progress');
      return;
    }

    shutdownStarted = true;
    shuttingDown = true;

    logger.info(
      {
        signal,
        activeRequests,
        timeoutMs,
        rejectNewRequestsForMs
      },
      'Shutdown signal received'
    );

    const forceExit = setTimeout(() => {
      logger.error(
        {
          signal,
          activeRequests,
          timeoutMs
        },
        'Graceful shutdown timed out'
      );
      process.exit(1);
    }, timeoutMs);
    forceExit.unref?.();

    if (rejectNewRequestsForMs > 0) {
      await sleep(rejectNewRequestsForMs);
    }

    logger.info({ signal, activeRequests }, 'HTTP server closing');
    const serverClosePromise = closeServer(server);
    await waitForActiveRequests();
    server.closeIdleConnections?.();
    logger.info({ signal, openSockets: sockets.size }, 'HTTP sockets closing');
    for (const socket of sockets) {
      socket.destroy();
    }

    await Promise.all(resources.map((resource) => closeResource(resource, logger)));

    const serverCloseError = await serverClosePromise;
    if (serverCloseError) {
      logger.error({ signal, error: serverCloseError }, 'HTTP server close failed');
    } else {
      logger.info({ signal }, 'HTTP server closed');
    }

    clearTimeout(forceExit);
    logger.info({ signal }, 'Graceful shutdown completed');
    process.exit(0);
  }

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  return {
    get activeRequests() {
      return activeRequests;
    },
    isShuttingDown() {
      return shuttingDown;
    },
    middleware,
    shutdown
  };
}
