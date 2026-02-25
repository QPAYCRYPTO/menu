import { env } from '../config/env.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = {
  message: string;
  request_id?: string;
  business_id?: string;
  [key: string]: unknown;
};

function write(level: LogLevel, context: LogContext): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: env.serviceName,
    ...context
  };
  const line = JSON.stringify(payload);

  if (level === 'error') {
    process.stderr.write(`${line}\n`);
    return;
  }

  process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (context: LogContext) => write('debug', context),
  info: (context: LogContext) => write('info', context),
  warn: (context: LogContext) => write('warn', context),
  error: (context: LogContext) => write('error', context)
};
