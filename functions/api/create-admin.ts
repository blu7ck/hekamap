import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { getSupabaseAdmin, checkIsOwner } from './supabase-admin';

type Env = BaseEnv & {
  SUPABASE_SERVICE_ROLE_KEY: string;
  MAILGUN_API_KEY: string;
  MAILGUN_DOMAIN: string;
};

function generatePassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length];
  }
  return password;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 }) as unknown as CfResponse;
  }

  const token = getBearerToken(context.request);
  if (!token) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;

  const verified = await verifySupabaseToken(token, context.env);
  if (!verified.valid) return new Response('Unauthorized', { status: 401 }) as unknown as CfResponse;
  const callerId = verified.payload.sub as string;

  const isOwner = await checkIsOwner(context.env, callerId);
  if (!isOwner) {
    return new Response('Only owner can create admins', { status: 403 }) as unknown as CfResponse;
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response('Bad Request', { status: 400 }) as unknown as CfResponse;
  }

  const email = (body?.email || '').toString().trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return new Response('Valid email required', { status: 400 }) as unknown as CfResponse;
  }

  const password = generatePassword(20);
  const supabaseAdmin = getSupabaseAdmin(context.env);

  // Create auth user with admin role
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'admin',
      created_by_owner: callerId,
    },
  });

  if (error || !data.user) {
    console.error('createUser error', error);
    return new Response('User creation failed', { status: 400 }) as unknown as CfResponse;
  }

  // Upsert user_profiles row with admin role
  await supabaseAdmin.from('user_profiles').upsert(
    {
      id: data.user.id,
      role: 'admin',
      email: data.user.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  // Mailgun ile şifre gönderimi
  const { sendMailgunEmail } = await import('./mailgun');
  const appUrl = context.env.SUPABASE_URL?.replace('/rest/v1', '').replace('/auth/v1', '') || 'https://app.hekamap.com';
  const loginUrl = `${appUrl}/workspace/login`;

  const emailResult = await sendMailgunEmail(context.env, {
    to: email,
    from: 'auth@notify.hekamap.com',
    subject: 'HekaMap Admin Hesabı Oluşturuldu',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">HekaMap Admin Hesabınız Oluşturuldu</h2>
        <p>Merhaba,</p>
        <p>HekaMap admin paneli için hesabınız oluşturulmuştur.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>E-posta:</strong> ${email}</p>
          <p style="margin: 8px 0 0 0;"><strong>Geçici Şifre:</strong> <code style="background: white; padding: 4px 8px; border-radius: 4px;">${password}</code></p>
        </div>
        <p><strong>Güvenlik Uyarısı:</strong> Lütfen ilk girişinizde şifrenizi değiştirin.</p>
        <p>Giriş yapmak için: <a href="${loginUrl}">Workspace Giriş Sayfası</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #6b7280; font-size: 12px;">Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
      </div>
    `,
    text: `HekaMap Admin Hesabı Oluşturuldu\n\nE-posta: ${email}\nGeçici Şifre: ${password}\n\nGüvenlik Uyarısı: Lütfen ilk girişinizde şifrenizi değiştirin.\n\nGiriş: ${loginUrl}`,
  });

  if (!emailResult.ok) {
    console.error('Email send failed', emailResult.error);
    // Kullanıcı oluşturuldu ama email gönderilemedi - log'a kaydet
  }

  return new Response(
    JSON.stringify({
      ok: true,
      email,
      emailSent: emailResult.ok,
      ...(process.env.NODE_ENV === 'development' ? { generatedPassword: password } : {}),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  ) as unknown as CfResponse;
};


