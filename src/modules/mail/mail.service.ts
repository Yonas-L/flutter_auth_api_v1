import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private mailEnabled: boolean;
  private fromAddress: string;

  constructor(private configService: ConfigService) {
    // Read config flags
    this.mailEnabled = this.configService.get<string>('MAIL_ENABLED', 'false') === 'true';
    this.fromAddress = this.configService.get<string>('MAIL_FROM', this.configService.get<string>('GMAIL_USER', 'no-reply@example.com'));

    if (this.mailEnabled) {
      const user = this.configService.get<string>('GMAIL_USER');
      const pass = this.configService.get<string>('GMAIL_APP_PASSWORD');

      if (!user || !pass) {
        console.warn('MAIL_ENABLED=true but GMAIL_USER/GMAIL_APP_PASSWORD not set. Falling back to console transport.');
        this.mailEnabled = false;
      } else {
        // Gmail SMTP using App Password (requires 2FA on the account)
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user,
            pass,
          },
        });
      }
    }

    // Fallback to stream transport (logs the message) when disabled or misconfigured
    if (!this.mailEnabled) {
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
      });
    }
  }

  async sendOtp(email: string, otp: string): Promise<void> {
    const subject = 'Your Arada Transport verification code';
    const text = `Your verification code is ${otp}. It expires in 10 minutes.`;
    const html = `<p>Your verification code is <b>${otp}</b>.</p><p>It expires in 10 minutes.</p>`;

    if (!this.mailEnabled) {
      // Dev/Test mode: log OTP and a preview of the message
      console.log(`🔐 OTP for ${email}: ${otp}`);
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: email,
        subject,
        text,
        html,
      });
      if ((info as any).message) {
        console.log('✉️ Dev email (streamed):\n' + (info as any).message.toString());
      }
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: email,
        subject,
        text,
        html,
      });
      console.log(`✅ Email sent to ${email}. MessageId: ${info.messageId}`);
    } catch (err) {
      console.error('❌ Failed to send email via Gmail:', err?.response || err?.message || err);
      // Also log OTP so the flow is still testable even if email fails
      console.log(`🔐 [Fallback] OTP for ${email}: ${otp}`);
    }
  }
}
