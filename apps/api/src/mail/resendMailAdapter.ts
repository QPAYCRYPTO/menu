// apps/api/src/mail/resendMailAdapter.ts
import { Resend } from 'resend';
import type { MailAdapter, MailMessage } from './types.js';
import { env } from '../config/env.js';

export class ResendMailAdapter implements MailAdapter {
  private getClient(): Resend {
    if (!env.resendApiKey) throw new Error('RESEND_API_KEY tanımlanmamış.');
    return new Resend(env.resendApiKey);
  }

  async send(message: MailMessage): Promise<void> {
    await this.getClient().emails.send({
      from: env.mailFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
  }
}