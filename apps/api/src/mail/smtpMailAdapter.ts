import nodemailer from 'nodemailer';
import type { MailAdapter, MailMessage } from './types.js';
import { env } from '../config/env.js';

export class SmtpMailAdapter implements MailAdapter {
  private transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined
  });

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: env.mailFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
  }
}
