// apps/api/src/mail/index.ts
import { env } from '../config/env.js';
import type { MailAdapter } from './types.js';
import { ConsoleMailAdapter } from './consoleMailAdapter.js';
import { SmtpMailAdapter } from './smtpMailAdapter.js';
import { ResendMailAdapter } from './resendMailAdapter.js';

export function createMailAdapter(): MailAdapter {
  if (env.mailProvider === 'resend') {
    return new ResendMailAdapter();
  }

  if (env.mailProvider === 'smtp') {
    return new SmtpMailAdapter();
  }

  return new ConsoleMailAdapter();
}