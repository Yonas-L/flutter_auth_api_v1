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
      // Prefer generic SMTP if provided
      const smtpHost = this.configService.get<string>('SMTP_HOST');
      const smtpPort = parseInt(this.configService.get<string>('SMTP_PORT', '587'), 10);
      const smtpSecure = this.configService.get<string>('SMTP_SECURE', 'false') === 'true';
      const smtpUser = this.configService.get<string>('SMTP_USER');
      const smtpPass = this.configService.get<string>('SMTP_PASS');

      if (smtpHost && smtpUser && smtpPass) {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: { user: smtpUser, pass: smtpPass },
        });
      } else {
        // Fallback to Gmail SMTP using App Password (requires 2FA on the account)
        const user = this.configService.get<string>('GMAIL_USER');
        const pass = this.configService.get<string>('GMAIL_APP_PASSWORD');
        if (!user || !pass) {
          console.warn('MAIL_ENABLED=true but no SMTP or Gmail creds set. Falling back to console transport.');
          this.mailEnabled = false;
        } else {
          this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user, pass },
          });
        }
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

  async sendUserCreationEmail(
    email: string,
    fullName: string,
    tempPassword: string,
    userType: 'admin' | 'customer_support',
  ): Promise<void> {
    const subject = 'Welcome to Arada Transport - Your Account Details';
    const text = `Hello ${fullName},\n\nYour ${userType} account has been created.\n\nTemporary Password: ${tempPassword}\n\nPlease log in and change your password immediately.\n\nBest regards,\nArada Transport Team`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Arada Transport</h2>
        <p>Hello ${fullName},</p>
        <p>Your ${userType} account has been created successfully.</p>
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        </div>
        <p><strong>Important:</strong> Please log in and change your password immediately for security reasons.</p>
        <p>Best regards,<br>Arada Transport Team</p>
      </div>
    `;

    if (!this.mailEnabled) {
      console.log(`📧 User creation email for ${email}:`);
      console.log(`   Name: ${fullName}`);
      console.log(`   Type: ${userType}`);
      console.log(`   Temp Password: ${tempPassword}`);
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
      console.log(`✅ User creation email sent to ${email}. MessageId: ${info.messageId}`);
    } catch (err) {
      console.error('❌ Failed to send user creation email:', err?.response || err?.message || err);
      console.log(`📧 [Fallback] User creation details for ${email}:`);
      console.log(`   Name: ${fullName}`);
      console.log(`   Type: ${userType}`);
      console.log(`   Temp Password: ${tempPassword}`);
    }
  }
}
