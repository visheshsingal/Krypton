import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { config } from '../config/env';

export async function submitContact(req: Request, res: Response): Promise<void> {
  const { name, email, company, seatsNeeded = 25, message } = req.body;

  console.log(`[Public Contact] Inbound request from ${name} (${email}) at ${company} - Seats: ${seatsNeeded}`);

  // Send notification email if configured
  if (config.smtp.user && config.smtp.pass && config.smtp.to) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: config.smtp.user, pass: config.smtp.pass },
      });

      await transporter.sendMail({
        from: `"${name} via Krypton Demo" <${config.smtp.from}>`,
        to: config.smtp.to,
        subject: `[Krypton Lead] Demo Request: ${company} (${seatsNeeded} seats)`,
        text: `Name: ${name}\nEmail: ${email}\nCompany: ${company}\nSeats: ${seatsNeeded}\n\nMessage:\n${message}`,
      });
    } catch (e: any) {
      console.warn(`[Public Contact] Email notification skipped: ${e.message}`);
    }
  }

  res.status(200).json({
    message: 'Thank you for reaching out! A Krypton AI security specialist will contact you shortly.',
  });
}

export async function getDownloadInfo(req: Request, res: Response): Promise<void> {
  res.json({
    platform: 'Windows',
    architecture: 'x64',
    appVersion: '1.0.0',
    installerName: 'Krypton-Security-Setup-1.0.0.exe',
    downloadUrl: '/downloads/Krypton-Security-Setup-1.0.0.exe',
    fileSizeBytes: 79563773,
    sha256Checksum: '32d0f126d08eff60c9794a1b09df08af57ade5b0d782953180a443d7ebd230a2',
    releaseDate: '2026-10-28',
    minimumRequirements: {
      os: 'Windows 10 / 11 (64-bit)',
      ram: '4 GB minimum, 8 GB recommended',
      disk: '250 MB free disk space',
    },
    downloads: {
      windows: {
        architecture: 'x64',
        installerName: 'Krypton-Security-Setup-1.0.0.exe',
        downloadUrl: '/downloads/Krypton-Security-Setup-1.0.0.exe',
        fileSizeBytes: 79563773,
        sha256Checksum: '32d0f126d08eff60c9794a1b09df08af57ade5b0d782953180a443d7ebd230a2',
      },
      macos: {
        available: false,
        releaseStatus: 'pending-apple-signing-and-notarization',
        architectures: {
          appleSilicon: {
            architecture: 'arm64',
            installerName: 'Krypton-macOS-1.0.0-arm64.dmg',
            downloadUrl: '/downloads/Krypton-macOS-1.0.0-arm64.dmg',
          },
          intel: {
            architecture: 'x64',
            installerName: 'Krypton-macOS-1.0.0-x64.dmg',
            downloadUrl: '/downloads/Krypton-macOS-1.0.0-x64.dmg',
          },
        },
      },
    },
    documentationUrl: '/docs/windows-deployment',
  });
}

export async function healthCheck(req: Request, res: Response): Promise<void> {
  res.json({
    status: 'healthy',
    service: 'Krypton AI Security SaaS API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
}
