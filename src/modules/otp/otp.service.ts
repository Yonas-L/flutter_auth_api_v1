import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OtpService {
  private otps = new Map();

  async generateOtp(): Promise<string> {
    // Generate a 4-digit OTP to match the mobile UI (0000–9999 avoided; ensure 4 digits)
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // Generic create for arbitrary key (email/phone)
  async createOtpForKey(key: string, code: string, expiresInMinutes = 10): Promise<any> {
    const normalizedKey = key.trim().toLowerCase();

    const saltRounds = 10;
    const codeHash = await bcrypt.hash(code, saltRounds);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

    const otp = {
      key: normalizedKey,
      codeHash,
      expiresAt,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date(),
    };

    this.otps.set(normalizedKey, otp);
    console.log(`📝 OTP stored for ${normalizedKey}, expires at ${expiresAt.toISOString()}`);
    console.log(`📊 Total OTPs in memory: ${this.otps.size}`);
    console.log(`🔑 OTP map keys: ${JSON.stringify(Array.from(this.otps.keys()))}`);
    return otp;
  }

  // Generic verify for arbitrary key (email/phone)
  async verifyOtpForKey(key: string, code: string): Promise<{ valid: boolean; message?: string }> {
    const normalizedKey = key.trim().toLowerCase();

    console.log(`🔍 Verifying OTP for ${normalizedKey} with code ${code}`);
    console.log(`📊 Total OTPs in memory before verify: ${this.otps.size}`);
    console.log(`🔑 OTP map keys: ${JSON.stringify(Array.from(this.otps.keys()))}`);

    const otpRecord = this.otps.get(normalizedKey);
    console.log(`📋 OTP record found for ${normalizedKey}:`, otpRecord ? 'YES' : 'NO');

    if (!otpRecord || new Date() > otpRecord.expiresAt) {
      if (otpRecord) {
        console.log(`⏰ OTP expired at ${otpRecord.expiresAt.toISOString()}, now is ${new Date().toISOString()}`);
      }
      this.otps.delete(normalizedKey);
      return { valid: false, message: 'OTP not found or expired' };
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      console.log(`🚫 Max attempts exceeded for ${normalizedKey}`);
      return { valid: false, message: 'Maximum attempts exceeded' };
    }

    otpRecord.attempts += 1;

    const isValid = await bcrypt.compare(code, otpRecord.codeHash);
    console.log(`✅ OTP validation result for ${normalizedKey}: ${isValid}`);

    if (isValid) {
      this.otps.delete(normalizedKey);
      return { valid: true };
    }

    return { valid: false, message: 'Invalid OTP code' };
  }

  async cleanupExpiredOtps(): Promise<void> {
    const now = new Date();
    for (const [email, otp] of this.otps.entries()) {
      if (now > otp.expiresAt) {
        this.otps.delete(email);
      }
    }
  }

  // Back-compat helpers for email
  async createOtp(email: string, code: string, expiresInMinutes = 10): Promise<any> {
    return this.createOtpForKey(email, code, expiresInMinutes);
  }

  async verifyOtp(email: string, code: string): Promise<{ valid: boolean; message?: string }> {
    return this.verifyOtpForKey(email, code);
  }

  // Convenience helpers for phone numbers
  async createOtpForPhone(phone: string, code: string, expiresInMinutes = 10): Promise<any> {
    return this.createOtpForKey(phone, code, expiresInMinutes);
  }

  async verifyOtpForPhone(phone: string, code: string): Promise<{ valid: boolean; message?: string }> {
    return this.verifyOtpForKey(phone, code);
  }
}
