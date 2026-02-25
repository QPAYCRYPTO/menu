import { env } from '../config/env.js';
import { createMailAdapter } from '../mail/index.js';

const mailAdapter = createMailAdapter();

export async function sendPasswordResetMail(email: string, token: string): Promise<void> {
  const resetUrl = `${env.appUrl}/sifre-sifirla?token=${token}`;

  await mailAdapter.send({
    to: email,
    subject: 'Şifre Sıfırlama',
    text: `Şifrenizi sıfırlamak için bağlantıyı kullanın: ${resetUrl}`,
    html: `<p>Şifrenizi sıfırlamak için bağlantıyı kullanın:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
  });
}
