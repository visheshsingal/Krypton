import nodemailer from 'nodemailer';
import { config } from '../config/env';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter && config.smtp.user && config.smtp.pass) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
}

export async function sendInvitationEmail(
  toEmail: string,
  inviteeName: string,
  companyName: string,
  inviteToken: string,
  licenseKey: string
): Promise<boolean> {
  const inviteUrl = `${config.frontendUrl}/accept-invitation?token=${inviteToken}`;
  const downloadUrl = `${config.frontendUrl}/download`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
      <div style="border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 24px;">
        <h2 style="color: #0f172a; margin: 0; font-size: 20px;">Krypton AI Data Loss Prevention</h2>
      </div>
      <p style="color: #334155; font-size: 15px;">Hello ${inviteeName},</p>
      <p style="color: #334155; font-size: 15px;">
        You have been invited by <strong>${companyName}</strong> to join their AI Data Governance & Security workspace on Krypton.
      </p>
      
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748b; font-weight: 600; text-transform: uppercase;">Your Company License Key</p>
        <code style="font-family: monospace; font-size: 16px; color: #0f172a; background: #e2e8f0; padding: 4px 8px; border-radius: 4px; display: inline-block;">${licenseKey}</code>
      </div>

      <div style="margin: 24px 0;">
        <a href="${inviteUrl}" style="background: #0f172a; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block; margin-right: 12px;">Accept Invitation & Setup Password</a>
        <a href="${downloadUrl}" style="background: #10b981; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px; display: inline-block;">Download Windows App</a>
      </div>

      <p style="color: #64748b; font-size: 13px; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
        This invitation will expire in 7 days. If you did not expect this invitation, you can safely ignore this email.
      </p>
    </div>
  `;

  try {
    const t = getTransporter();
    if (t) {
      await t.sendMail({
        from: `"${companyName} via Krypton" <${config.smtp.from}>`,
        to: toEmail,
        subject: `[Krypton] Invitation to join ${companyName} AI Security Workspace`,
        html,
      });
      console.log(`[EmailService] Invitation email successfully dispatched to ${toEmail}`);
      return true;
    } else {
      console.log(`[EmailService] SMTP not fully configured. Simulated email for ${toEmail}. Invite URL: ${inviteUrl}`);
      return true;
    }
  } catch (error: any) {
    console.warn(`[EmailService] Email dispatch failed (${error.message}). Logged for development: Invite URL=${inviteUrl}`);
    return false;
  }
}
