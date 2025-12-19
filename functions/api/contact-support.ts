import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { sendMailgunEmail } from './mailgun';

type Env = {
  MAILGUN_API_KEY: string;
  MAILGUN_DOMAIN: string;
  SUPPORT_EMAIL?: string;
};

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 }) as unknown as CfResponse;
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response('Bad Request', { status: 400 }) as unknown as CfResponse;
  }

  const { firstName, lastName, email, phone, subject, message } = body || {};
  if (!email || !message) {
    return new Response('email and message required', { status: 400 }) as unknown as CfResponse;
  }

  // Anasayfa formu direkt halit@hekamap.com'a gönderilir
  // destek@hekamap.com community yapısı kurulduğunda kullanılacak (şimdilik kullanılmıyor)
  const contactEmail = 'halit@hekamap.com';

  const emailResult = await sendMailgunEmail(context.env, {
    to: contactEmail,
    from: 'auth@notify.hekamap.com',
    replyTo: email,
    subject: `İletişim Formu: ${subject || 'Genel'}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">Yeni Destek Talebi</h2>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Ad:</strong> ${firstName || '—'}</p>
          <p style="margin: 8px 0 0 0;"><strong>Soyad:</strong> ${lastName || '—'}</p>
          <p style="margin: 8px 0 0 0;"><strong>E-posta:</strong> ${email}</p>
          <p style="margin: 8px 0 0 0;"><strong>Telefon:</strong> ${phone || '—'}</p>
          <p style="margin: 8px 0 0 0;"><strong>Konu:</strong> ${subject || 'Genel'}</p>
        </div>
        <div style="background: white; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Mesaj:</h3>
          <p style="white-space: pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #6b7280; font-size: 12px;">Bu e-posta HekaMap web sitesinden gönderilmiştir.</p>
      </div>
    `,
    text: `Yeni Destek Talebi\n\nAd: ${firstName || '—'}\nSoyad: ${lastName || '—'}\nE-posta: ${email}\nTelefon: ${phone || '—'}\nKonu: ${subject || 'Genel'}\n\nMesaj:\n${message}`,
  });

  if (!emailResult.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: emailResult.error }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    ) as unknown as CfResponse;
  }

  return new Response(
    JSON.stringify({ ok: true, messageId: emailResult.messageId }),
    { headers: { 'Content-Type': 'application/json' } }
  ) as unknown as CfResponse;
};

