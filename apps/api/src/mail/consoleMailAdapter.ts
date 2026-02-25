import type { MailAdapter, MailMessage } from './types.js';
import { logger } from '../logger/logger.js';

export class ConsoleMailAdapter implements MailAdapter {
  async send(message: MailMessage): Promise<void> {
    logger.info({
      message: 'mail_console_fallback',
      to: message.to,
      subject: message.subject,
      text: message.text
    });
  }
}
