import type { PagesFunction, Response as CfResponse } from '@cloudflare/workers-types';
import { getBearerToken, verifySupabaseToken, type Env as BaseEnv } from './verify-token';
import { getSupabaseAdmin, checkIsOwner } from './supabase-admin';
import { sendMailgunEmail } from './mailgun';

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
    return new Response('Only owner can reset admin passwords', { status: 403 }) as unknown as CfResponse;
  }

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return new Response('Bad Request', { status: 400 }) as unknown as CfResponse;
  }

  const userId = body?.user_id;
  if (!userId) {
    return new Response('user_id required', { status: 400 }) as unknown as CfResponse;
  }

  const supabaseAdmin = getSupabaseAdmin(context.env);

  // Get user email
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData?.user?.email) {
    return new Response('User not found', { status: 404 }) as unknown as CfResponse;
  }

  const newPassword = generatePassword(20);

  // Update password
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (updateError) {
    return new Response('Password update failed', { status: 400 }) as unknown as CfResponse;
  }

  // Send email
  const appUrl = context.env.SUPABASE_URL?.replace('/rest/v1', '').replace('/auth/v1', '') || 'https://app.hekamap.com';
  const loginUrl = `${appUrl}/workspace/login`;

  const emailResult = await sendMailgunEmail(context.env, {
    to: userData.user.email,
    from: 'auth@notify.hekamap.com',
    subject: 'HekaMap Şifre Yenilendi',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981;">Şifreniz Yenilendi</h2>
        <p>Merhaba,</p>
        <p>HekaMap admin hesabınızın şifresi yenilenmiştir.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>E-posta:</strong> ${userData.user.email}</p>
          <p style="margin: 8px 0 0 0;"><strong>Yeni Şifre:</strong> <code style="background: white; padding: 4px 8px; border-radius: 4px;">${newPassword}</code></p>
        </div>
        <p><strong>Güvenlik Uyarısı:</strong> Lütfen giriş yaptıktan sonra şifrenizi değiştirin.</p>
        <p>Giriş yapmak için: <a href="${loginUrl}">Workspace Giriş Sayfası</a></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #6b7280; font-size: 12px;">Bu e-posta otomatik olarak gönderilmiştir. Lütfen yanıtlamayın.</p>
      </div>
    `,
    text: `HekaMap Şifre Yenilendi\n\nE-posta: ${userData.user.email}\nYeni Şifre: ${newPassword}\n\nGüvenlik Uyarısı: Lütfen giriş yaptıktan sonra şifrenizi değiştirin.\n\nGiriş: ${loginUrl}`,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      email: userData.user.email,
      emailSent: emailResult.ok,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  ) as unknown as CfResponse;
};

