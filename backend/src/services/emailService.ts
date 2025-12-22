/**
 * Email service for sending viewer access emails
 * Uses Mailgun API directly from backend
 */

export interface ViewerAccessEmailData {
  email: string;
  accessToken: string;
  pin: string;
  projectName?: string;
  assetName?: string;
  accessUrl: string;
}

export class EmailService {
  private static mailgunApiKey: string;
  private static mailgunDomain: string;
  private static mailgunRegion: 'us' | 'eu';
  private static appUrl: string;

  static initialize(env: {
    MAILGUN_API_KEY: string;
    MAILGUN_DOMAIN: string;
    MAILGUN_REGION?: 'us' | 'eu';
    APP_URL?: string;
  }) {
    this.mailgunApiKey = env.MAILGUN_API_KEY;
    this.mailgunDomain = env.MAILGUN_DOMAIN;
    this.mailgunRegion = env.MAILGUN_REGION || 'us';
    this.appUrl = env.APP_URL || 'http://localhost:3000';
  }

  /**
   * Send viewer access email with PIN and access link
   */
  static async sendViewerAccessEmail(data: ViewerAccessEmailData): Promise<{ ok: boolean; error?: string }> {
    if (!this.mailgunApiKey || !this.mailgunDomain) {
      throw new Error('Mailgun not configured. Call EmailService.initialize() first.');
    }

    const subject = data.assetName 
      ? `Viewer Access to ${data.assetName}`
      : `Viewer Access to Project`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .pin-box { background-color: #ffffff; border: 2px solid #10b981; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
          .pin { font-size: 32px; font-weight: bold; color: #10b981; letter-spacing: 8px; }
          .button { display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
          .warning { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>HekaMap Viewer Access</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>You have been granted viewer access to ${data.assetName || 'a project'}:</p>
            ${data.projectName ? `<p><strong>Project:</strong> ${data.projectName}</p>` : ''}
            ${data.assetName ? `<p><strong>Asset:</strong> ${data.assetName}</p>` : ''}
            
            <div class="pin-box">
              <p style="margin: 0 0 10px 0; color: #6b7280;">Your access PIN:</p>
              <div class="pin">${data.pin}</div>
            </div>

            <div class="warning">
              <strong>Important:</strong> Keep your PIN secure. You will need both your email address and PIN to access the project.
            </div>

            <p>Click the button below to access:</p>
            <a href="${data.accessUrl}" class="button">Access Project</a>

            <p>Or copy this link:</p>
            <p style="word-break: break-all; color: #6b7280;">${data.accessUrl}</p>

            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
              <p>If you did not request this access, you can safely ignore this email.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `
HekaMap Viewer Access

Hello,

You have been granted viewer access to ${data.assetName || 'a project'}.
${data.projectName ? `Project: ${data.projectName}\n` : ''}${data.assetName ? `Asset: ${data.assetName}\n` : ''}

Your access PIN: ${data.pin}

Important: Keep your PIN secure. You will need both your email address and PIN to access the project.

Access link: ${data.accessUrl}

This is an automated message. Please do not reply to this email.
If you did not request this access, you can safely ignore this email.
    `;

    const formData = new FormData();
    formData.append('from', `HekaMap <auth@${this.mailgunDomain}>`);
    formData.append('to', data.email);
    formData.append('subject', subject);
    formData.append('html', html);
    formData.append('text', text);

    try {
      const apiBase = this.mailgunRegion === 'eu' 
        ? 'https://api.eu.mailgun.net/v3' 
        : 'https://api.mailgun.net/v3';
      const apiUrl = `${apiBase}/${this.mailgunDomain}/messages`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${this.mailgunApiKey}`).toString('base64')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Mailgun API error:', response.status, errorText);
        return { ok: false, error: `Mailgun API error: ${response.status}` };
      }

      const result = await response.json();
      return { ok: true };
    } catch (error: any) {
      console.error('Email send error:', error);
      return { ok: false, error: error.message || 'Failed to send email' };
    }
  }
}

