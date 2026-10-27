import nodemailer from 'nodemailer';

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || 'visheshhhaggarwal@gmail.com';
const TO_EMAIL = process.env.TO_EMAIL || 'vishesh.singal.contact@gmail.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter && EMAIL_USER && EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
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
  const inviteUrl = `${APP_URL}/accept-invitation?token=${inviteToken}`;
  const downloadUrl = `${APP_URL}/download`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff;">
      <div style="border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 24px;">
        <h2 style="color: #0f172a; margin: 0; font-size: 20px;">Krypton AI Security & Data Governance</h2>
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
        from: `"${companyName} via Krypton" <${EMAIL_FROM}>`,
        to: toEmail,
        subject: `[Krypton] Invitation to join ${companyName} AI Security Workspace`,
        html,
      });
      console.log(`[Email] Invitation email sent to ${toEmail}`);
      return true;
    } else {
      console.log(`[Email] SMTP simulated for ${toEmail}. Link: ${inviteUrl}`);
      return true;
    }
  } catch (err: any) {
    console.warn(`[Email] Failed to send email: ${err.message}. Link: ${inviteUrl}`);
    return false;
  }
}

export async function sendLeadNotification(name: string, email: string, company: string, seats: number, message: string) {
  try {
    const t = getTransporter();
    if (t) {
      await t.sendMail({
        from: `"${name} via Krypton Demo" <${EMAIL_FROM}>`,
        to: TO_EMAIL,
        subject: `[Krypton Lead] Demo Request: ${company} (${seats} seats)`,
        text: `Name: ${name}\nEmail: ${email}\nCompany: ${company}\nSeats: ${seats}\n\nMessage:\n${message}`,
      });
    }
  } catch (err: any) {
    console.warn('[Email] Lead email skipped:', err.message);
  }
}
