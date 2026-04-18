// apps/api/src/services/mailService.ts
import { env } from '../config/env.js';
import { createMailAdapter } from '../mail/index.js';

const mailAdapter = createMailAdapter();

export async function sendPasswordResetMail(email: string, token: string): Promise<void> {
  const resetUrl = `${env.appUrl}/sifre-sifirla?token=${token}`;

  await mailAdapter.send({
    to: email,
    subject: `${env.brand} — Şifre Sıfırlama`,
    text: `Şifrenizi sıfırlamak için bağlantıyı kullanın: ${resetUrl}`,
    html: `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        
        <!-- Header -->
        <tr>
          <td style="background:#0F172A;padding:32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;letter-spacing:1px;">
              Atlas<span style="color:#0D9488;">QR</span>
            </h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.5);font-size:12px;letter-spacing:2px;">YÖNETİM PANELİ</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 32px;">
            <h2 style="margin:0 0 16px;color:#0F172A;font-size:20px;">Şifre Sıfırlama</h2>
            <p style="margin:0 0 24px;color:#64748B;font-size:14px;line-height:1.6;">
              Şifrenizi sıfırlamak için aşağıdaki butona tıklayın. Bu bağlantı <strong>30 dakika</strong> geçerlidir.
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${resetUrl}" 
                style="display:inline-block;background:#0D9488;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:bold;">
                Şifremi Sıfırla
              </a>
            </div>
            <p style="margin:24px 0 0;color:#94A3B8;font-size:12px;line-height:1.6;">
              Eğer bu isteği siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz. Şifreniz değiştirilmeyecektir.
            </p>
            <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;">
            <p style="margin:0;color:#CBD5E1;font-size:11px;">
              Bağlantı çalışmıyorsa şu adresi tarayıcınıza kopyalayın:<br>
              <span style="color:#0D9488;">${resetUrl}</span>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F8FAFC;padding:20px 32px;text-align:center;border-top:1px solid #E2E8F0;">
            <p style="margin:0;color:#94A3B8;font-size:12px;">
              Powered by <strong style="color:#0D9488;">${env.brand}</strong>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
  });
}