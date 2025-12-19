import type { Env } from './verify-token';

type MailgunEnv = Env & {
  MAILGUN_API_KEY: string;
  MAILGUN_DOMAIN: string;
};

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export async function sendMailgunEmail(
  env: MailgunEnv,
  options: EmailOptions
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const apiKey = env.MAILGUN_API_KEY;
  const domain = env.MAILGUN_DOMAIN;
  
  // Production domain: notify.hekamap.com
  // Gönderici adresi: auth@notify.hekamap.com
  const from = options.from || `auth@notify.hekamap.com`;

  const formData = new FormData();
  formData.append('from', from);
  formData.append('to', options.to);
  formData.append('subject', options.subject);
  formData.append('html', options.html);
  if (options.text) {
    formData.append('text', options.text);
  }
  if (options.replyTo) {
    formData.append('h:Reply-To', options.replyTo);
  }

  try {
    // Mailgun API endpoint (EU domain için farklı olabilir, şimdilik US kullanıyoruz)
    const apiUrl = `https://api.mailgun.net/v3/${domain}/messages`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Mailgun API error:', data);
      return { ok: false, error: data.message || 'Mailgun API error' };
    }
    return { ok: true, messageId: data.id };
  } catch (err: any) {
    console.error('Mailgun network error:', err);
    return { ok: false, error: err.message || 'Network error' };
  }
}

