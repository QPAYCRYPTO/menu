// apps/api/src/services/mailService.ts
import { env } from '../config/env.js';
import { createMailAdapter } from '../mail/index.js';

const mailAdapter = createMailAdapter();

// Uygulamanın yeni görünümüyle uyumlu renkler (koyu cam + turuncu vurgu).
// E-posta istemcileri blur/backdrop-filter desteklemediği için koyu, düz tonlarla taklit edilir.
const MAIL_ACCENT = '#FF7A29';
const MAIL_ACCENT_DEEP = '#D1641F';
const MAIL_BG = '#1C1714';
const MAIL_CARD = '#2A2320';
const MAIL_BORDER = '#3F3530';

export async function sendPasswordResetMail(email: string, token: string): Promise<void> {
  const resetUrl = `${env.appUrl}/sifre-sifirla?token=${token}`;

  await mailAdapter.send({
    to: email,
    subject: `${env.brand} — Şifre Sıfırlama`,
    text: `Şifrenizi sıfırlamak için bağlantıyı kullanın (30 dakika geçerli, tek kullanımlık): ${resetUrl}`,
    html: `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
</head>
<body style="margin:0;padding:0;background:${MAIL_BG};font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="${MAIL_BG}"
    style="background:${MAIL_BG};background-image:radial-gradient(circle at 20% 0%,#4A2E1C 0%,${MAIL_BG} 55%);padding:40px 16px;">
    <tr><td align="center">

      <!-- Logo -->
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
        <tr>
          <td align="center" style="padding-bottom:24px;">
            <table cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td align="center" width="56" height="56" bgcolor="${MAIL_ACCENT}"
                  style="width:56px;height:56px;border-radius:16px;background:${MAIL_ACCENT};background-image:linear-gradient(135deg,#FF9152 0%,${MAIL_ACCENT_DEEP} 100%);border:1px solid rgba(255,255,255,0.55);color:#ffffff;font-size:26px;line-height:56px;">
                  &#128274;
                </td>
              </tr>
            </table>
            <h1 style="margin:14px 0 0;color:#ffffff;font-family:'Playfair Display',Georgia,serif;font-size:28px;font-weight:700;letter-spacing:0.5px;">
              Atlas<span style="color:${MAIL_ACCENT};">QR</span>
            </h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.55);font-size:11px;font-weight:600;letter-spacing:3px;">YENİ ŞİFRE BELİRLE</p>
          </td>
        </tr>
      </table>

      <!-- Kart -->
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="${MAIL_CARD}"
        style="max-width:480px;background:${MAIL_CARD};border:1px solid ${MAIL_BORDER};border-radius:24px;overflow:hidden;">
        <tr>
          <td style="padding:36px 28px 28px;">
            <h2 style="margin:0 0 12px;color:#ffffff;font-family:'Playfair Display',Georgia,serif;font-size:21px;font-weight:700;">Şifre Sıfırlama</h2>
            <p style="margin:0 0 8px;color:rgba(255,255,255,0.78);font-size:14px;line-height:1.65;">
              Hesabınız için şifre sıfırlama isteği aldık. Yeni şifrenizi belirlemek için aşağıdaki butona dokunun.
            </p>
            <p style="margin:0;color:rgba(255,255,255,0.6);font-size:13px;line-height:1.6;">
              Bağlantı <strong style="color:#FCD34D;">30 dakika</strong> geçerlidir ve <strong style="color:#FCD34D;">yalnızca bir kez</strong> kullanılabilir.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:30px 0 26px;">
              <tr>
                <td align="center">
                  <a href="${resetUrl}"
                    style="display:inline-block;background:${MAIL_ACCENT};background-image:linear-gradient(135deg,#FF9152 0%,${MAIL_ACCENT_DEEP} 100%);color:#ffffff;text-decoration:none;padding:15px 36px;border-radius:16px;font-size:15px;font-weight:700;border:1px solid rgba(255,255,255,0.45);">
                    Şifremi Sıfırla
                  </a>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="background:rgba(255,255,255,0.05);border:1px solid ${MAIL_BORDER};border-radius:14px;padding:12px 14px;color:rgba(255,255,255,0.6);font-size:12px;line-height:1.6;">
                  Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz; şifreniz değiştirilmez.
                </td>
              </tr>
            </table>

            <p style="margin:22px 0 0;color:rgba(255,255,255,0.45);font-size:11px;line-height:1.6;word-break:break-all;">
              Buton çalışmıyorsa şu adresi tarayıcınıza kopyalayın:<br>
              <a href="${resetUrl}" style="color:${MAIL_ACCENT};text-decoration:none;">${resetUrl}</a>
            </p>
          </td>
        </tr>
      </table>

      <!-- Alt bilgi -->
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
        <tr>
          <td align="center" style="padding-top:20px;color:rgba(255,255,255,0.45);font-size:12px;">
            Powered by <strong style="color:#FCD34D;">${env.brand}</strong>
          </td>
        </tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`
  });
}
