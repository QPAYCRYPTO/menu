// apps/api/src/mail/resendMailAdapter.ts
import { Resend } from 'resend';
import type { MailAdapter, MailMessage } from './types.js';
import { env } from '../config/env.js';

const resend = new Resend(env.resendApiKey);

export class ResendMailAdapter implements MailAdapter {
  async send(message: MailMessage): Promise<void> {
    await resend.emails.send({
      from: env.mailFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
  }
}