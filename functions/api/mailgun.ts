/**
 * Mailgun email sending utility
 * Independent of Supabase/authentication - only requires Mailgun credentials
 */
type MailgunEnv = {
  MAILGUN_API_KEY: string;
  MAILGUN_DOMAIN: string;
  MAILGUN_REGION?: 'us' | 'eu'; // Optional: 'eu' for EU region, default is 'us'
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
    // Mailgun API endpoint
    // EU domains: https://api.eu.mailgun.net/v3/
    // US domains: https://api.mailgun.net/v3/
    const region = env.MAILGUN_REGION || 'us';
    const apiBase = region === 'eu' ? 'https://api.eu.mailgun.net/v3' : 'https://api.mailgun.net/v3';
    const apiUrl = `${apiBase}/${domain}/messages`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
      },
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = 'Mailgun API error';
      try {
        const data = await response.json();
        console.error('Mailgun API error:', {
          status: response.status,
          statusText: response.statusText,
          data,
        });
        errorMessage = data.message || data.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      } catch (parseError) {
        // JSON parse failed, use text
        const text = await response.text();
        console.error('Mailgun API error (non-JSON):', {
          status: response.status,
          statusText: response.statusText,
          text: text.substring(0, 200),
        });
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      return { ok: false, error: errorMessage };
    }

    const data = await response.json();
    return { ok: true, messageId: data.id };
  } catch (err: any) {
    console.error('Mailgun network/exception error:', err);
    return { ok: false, error: err?.message || 'Network error' };
  }
}

