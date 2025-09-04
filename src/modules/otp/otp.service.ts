import { Injectable, Logger } from '@nestjs/common';
import { OtpRepository } from '../database/repositories/otp.repository';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(private readonly otpRepository: OtpRepository) { }

  async generateOtp(): Promise<string> {
    // Generate a 4-digit OTP to match the mobile UI (0000–9999 avoided; ensure 4 digits)
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Create OTP for phone number (Database version)
   */
  async createOtpForPhone(
    phoneE164: string,
    code: string,
    expiresInMinutes: number = 10,
    purpose: string = 'registration'
  ): Promise<any> {
    try {
      const saltRounds = 10;
      const codeHash = await bcrypt.hash(code, saltRounds);

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

      const otpCode = await this.otpRepository.create({
        phone_e164: phoneE164,
        code_hash: codeHash,
        purpose: purpose as any,
        expires_at: expiresAt.toISOString(),
        max_attempts: 3,
      });

      this.logger.log(`📝 OTP stored in database for ${phoneE164}, expires at ${expiresAt.toISOString()}`);

      return {
        id: otpCode.id,
        key: phoneE164,
        codeHash: otpCode.code_hash,
        expiresAt: otpCode.expires_at,
        attempts: otpCode.attempts,
        maxAttempts: otpCode.max_attempts,
        createdAt: otpCode.created_at,
      };
    } catch (error) {
      this.logger.error(`Error creating OTP for ${phoneE164}:`, error);
      throw error;
    }
  }

  /**
   * Verify OTP for phone number (Database version)
   */
  async verifyOtpForPhone(phoneE164: string, code: string, purpose: string = 'registration'): Promise<{ valid: boolean; message?: string }> {
    try {
      this.logger.log(`🔍 Verifying OTP for ${phoneE164} with code ${code}`);

      // Find active OTP
      const otpRecord = await this.otpRepository.findActiveByPhoneAndPurpose(phoneE164, purpose);
      this.logger.log(`📋 OTP record found for ${phoneE164}:`, otpRecord ? 'YES' : 'NO');

      if (!otpRecord) {
        return { valid: false, message: 'OTP not found or expired' };
      }

      // Check if max attempts exceeded
      if (otpRecord.attempts >= otpRecord.max_attempts) {
        this.logger.warn(`🚫 Max attempts exceeded for ${phoneE164}`);
        return { valid: false, message: 'Maximum attempts exceeded' };
      }

      // Increment attempts
      await this.otpRepository.incrementAttempts(otpRecord.id);

      // Verify the code
      const isValid = await bcrypt.compare(code, otpRecord.code_hash);
      this.logger.log(`✅ OTP validation result for ${phoneE164}: ${isValid}`);

      if (isValid) {
        // Mark as used first (for audit trail)
        await this.otpRepository.markAsUsed(otpRecord.id);

        // Delete the OTP immediately after successful verification (security best practice)
        await this.otpRepository.deleteAfterVerification(otpRecord.id);

        this.logger.log(`🔐 OTP successfully verified and deleted for ${phoneE164}`);
        return { valid: true };
      }

      return { valid: false, message: 'Invalid OTP code' };
    } catch (error) {
      this.logger.error(`Error verifying OTP for ${phoneE164}:`, error);
      throw error;
    }
  }

  /**
   * Generic create for arbitrary key (email/phone) - Legacy compatibility
   */
  async createOtpForKey(key: string, code: string, expiresInMinutes = 10): Promise<any> {
    // Assume it's a phone number for backward compatibility
    return this.createOtpForPhone(key, code, expiresInMinutes, 'registration');
  }

  /**
   * Generic verify for arbitrary key (email/phone) - Legacy compatibility
   */
  async verifyOtpForKey(key: string, code: string): Promise<{ valid: boolean; message?: string }> {
    // Assume it's a phone number for backward compatibility
    return this.verifyOtpForPhone(key, code, 'registration');
  }

  /**
   * Clean up expired OTPs (Database version)
   */
  async cleanupExpiredOtps(): Promise<number> {
    try {
      const deletedCount = await this.otpRepository.cleanupExpired();
      if (deletedCount > 0) {
        this.logger.log(`🧹 Cleaned up ${deletedCount} expired OTPs from database`);
      }
      return deletedCount;
    } catch (error) {
      this.logger.error('Error cleaning up expired OTPs:', error);
      throw error;
    }
  }

  /**
   * Clean up all OTPs for a phone number (useful after successful registration)
   */
  async cleanupAllOtpsForPhone(phoneE164: string): Promise<number> {
    try {
      const deletedCount = await this.otpRepository.deleteAllForPhone(phoneE164);
      if (deletedCount > 0) {
        this.logger.log(`🧹 Cleaned up ${deletedCount} OTP(s) for ${phoneE164}`);
      }
      return deletedCount;
    } catch (error) {
      this.logger.error(`Error cleaning up OTPs for ${phoneE164}:`, error);
      throw error;
    }
  }

  /**
   * Get OTP statistics
   */
  async getOtpStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    used: number;
    byPurpose: Record<string, number>;
  }> {
    try {
      return await this.otpRepository.getOtpStats();
    } catch (error) {
      this.logger.error('Error getting OTP stats:', error);
      throw error;
    }
  }

  // Back-compat helpers for email (redirect to phone methods)
  async createOtp(email: string, code: string, expiresInMinutes = 10): Promise<any> {
    return this.createOtpForKey(email, code, expiresInMinutes);
  }

  async verifyOtp(email: string, code: string): Promise<{ valid: boolean; message?: string }> {
    return this.verifyOtpForKey(email, code);
  }
}