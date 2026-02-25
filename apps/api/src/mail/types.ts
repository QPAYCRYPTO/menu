export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailAdapter {
  send(message: MailMessage): Promise<void>;
}
