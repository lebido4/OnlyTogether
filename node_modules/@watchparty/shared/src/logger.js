function write(level, scope, payload, message) {
  const entry = {
    level,
    scope,
    message,
    time: new Date().toISOString(),
    ...payload
  };
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function normalizeArgs(payloadOrMessage, maybeMessage) {
  if (typeof payloadOrMessage === 'string') {
    return [{}, payloadOrMessage];
  }

  return [payloadOrMessage ?? {}, maybeMessage ?? ''];
}

export function createLogger(scope) {
  return {
    info(payloadOrMessage, maybeMessage) {
      const [payload, message] = normalizeArgs(payloadOrMessage, maybeMessage);
      write('info', scope, payload, message);
    },
    warn(payloadOrMessage, maybeMessage) {
      const [payload, message] = normalizeArgs(payloadOrMessage, maybeMessage);
      write('warn', scope, payload, message);
    },
    error(payloadOrMessage, maybeMessage) {
      const [payload, message] = normalizeArgs(payloadOrMessage, maybeMessage);
      write('error', scope, payload, message);
    }
  };
}
