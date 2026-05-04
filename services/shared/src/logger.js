function serializeValue(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      status: value.status,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, serializeValue(item)])
    );
  }

  return value;
}

function write(level, service, payload, message) {
  const entry = {
    level,
    service,
    message,
    time: new Date().toISOString(),
    ...serializeValue(payload)
  };
  const line = `${JSON.stringify(entry)}\n`;

  if (level === 'error') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
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
