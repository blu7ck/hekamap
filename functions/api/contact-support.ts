import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { sendMailgunEmail } from './mailgun';

/**
 * Contact support endpoint - public, no authentication required
 * Sends email directly to halit@hekamap.com via Mailgun
 * Uses contact@notify.hekamap.com as sender (different from auth@ for account/password emails)
 */
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

  // Sanitize input to prevent XSS
  const sanitize = (str: string | undefined) => (str || '—').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');

  try {
    const emailResult = await sendMailgunEmail(context.env, {
      to: contactEmail,
      from: 'contact@notify.hekamap.com',
      replyTo: email,
      subject: `İletişim Formu: ${subject || 'Genel'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">Yeni Destek Talebi</h2>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Ad:</strong> ${sanitize(firstName)}</p>
            <p style="margin: 8px 0 0 0;"><strong>Soyad:</strong> ${sanitize(lastName)}</p>
            <p style="margin: 8px 0 0 0;"><strong>E-posta:</strong> ${sanitize(email)}</p>
            <p style="margin: 8px 0 0 0;"><strong>Telefon:</strong> ${sanitize(phone)}</p>
            <p style="margin: 8px 0 0 0;"><strong>Konu:</strong> ${sanitize(subject || 'Genel')}</p>
          </div>
          <div style="background: white; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Mesaj:</h3>
            <p style="white-space: pre-wrap;">${sanitize(message)}</p>
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 12px;">Bu e-posta HekaMap web sitesinden gönderilmiştir.</p>
        </div>
      `,
      text: `Yeni Destek Talebi\n\nAd: ${firstName || '—'}\nSoyad: ${lastName || '—'}\nE-posta: ${email}\nTelefon: ${phone || '—'}\nKonu: ${subject || 'Genel'}\n\nMesaj:\n${message}`,
    });

    if (!emailResult.ok) {
      console.error('[contact-support] Mailgun error:', emailResult.error);
      return new Response(
        JSON.stringify({ ok: false, error: emailResult.error || 'Email gönderilemedi' }),
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
  } catch (err: any) {
    console.error('[contact-support] Exception:', err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || 'Email gönderilemedi' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    ) as unknown as CfResponse;
  }
};
