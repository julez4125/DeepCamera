export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const priority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(activeLevel: LogLevel, messageLevel: LogLevel): boolean {
  return priority[messageLevel] >= priority[activeLevel];
}

function normalizeLevel(input?: string): LogLevel {
  switch (input) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return input;
    default:
      return 'info';
  }
}

function formatContext(context?: Record<string, unknown>): string {
  if (!context || Object.keys(context).length === 0) {
    return '';
  }

  return ` ${JSON.stringify(context)}`;
}

export interface Logger {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
  error: (message: string, context?: Record<string, unknown>) => void;
  child: (scope: string) => Logger;
}

export function createLogger(scope: string, level = process.env['LOG_LEVEL']): Logger {
  const activeLevel = normalizeLevel(level);

  function write(messageLevel: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!shouldLog(activeLevel, messageLevel)) {
      return;
    }

    const line = `${new Date().toISOString()} [${messageLevel.toUpperCase()}] [${scope}] ${message}${formatContext(context)}`;
    if (messageLevel === 'error') {
      console.error(line);
      return;
    }

    if (messageLevel === 'warn') {
      console.warn(line);
      return;
    }

    console.log(line);
  }

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
    child: (childScope) => createLogger(`${scope}:${childScope}`, activeLevel),
  };
}
