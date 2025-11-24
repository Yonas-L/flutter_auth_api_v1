import { Injectable, Logger } from '@nestjs/common';
import { OtpPostgresRepository } from '../database/repositories/otp-postgres.repository';
import { AfroMessageService } from './afro-message.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly otpRepository: OtpPostgresRepository,
    private readonly afroMessageService: AfroMessageService,
    private readonly mailService: MailService
  ) { }

  async generateOtp(): Promise<string> {
    // Generate a 6-digit OTP to match the passenger app UI
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Create OTP for phone number (Database version)
   */
  async createOtpForPhone(
    phoneNumber: string,
    expiresInMinutes: number = 10,
    purpose: string = 'registration'
  ): Promise<any> {
    try {
      // First, clean up any existing OTPs for this phone and purpose
      const existingCount = await this.otpRepository.deleteAllForPhoneAndPurpose(phoneNumber, purpose);
      if (existingCount > 0) {
        this.logger.log(`🧹 Cleaned up ${existingCount} existing OTP(s) for ${phoneNumber} with purpose ${purpose}`);
      }

      // ========== TEMPORARY BYPASS FOR TESTING ==========
      // TODO: Remove this bypass when AfroMessage API is recharged
      // Set BYPASS_SMS_OTP=true in environment to skip SMS sending
      const bypassSMS = process.env.BYPASS_SMS_OTP === 'true';

      let smsResult;

      if (bypassSMS) {
        // Generate OTP locally without sending SMS
        const code = await this.generateOtp();
        this.logger.warn(`⚠️ BYPASS MODE: Skipping SMS send. OTP: ${code}`);
        console.log(`🔐 BYPASS OTP CODE FOR ${phoneNumber}: ${code}`);
        smsResult = {
          success: true,
          code: code,
          verificationId: null,
          messageId: null,
        };
      } else {
        // Use AfroMessage to generate and send OTP (normal flow)
        smsResult = await this.afroMessageService.sendOtp(phoneNumber, expiresInMinutes * 60);

        if (!smsResult.success || !smsResult.code) {
          this.logger.error(`❌ Failed to send OTP via AfroMessage: ${smsResult.error || 'No code returned'}`);
          throw new Error(`Failed to send OTP: ${smsResult.error || 'No code returned'}`);
        }
      }
      // ========== END TEMPORARY BYPASS ==========

      // Store the OTP in our database
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

      const otpCode = await this.otpRepository.create({
        phone_number: phoneNumber,
        code_hash: smsResult.code, // Store the actual code
        purpose: purpose as any,
        expires_at: expiresAt.toISOString(),
        max_attempts: 3,
      });

      this.logger.log(`📝 OTP stored in database for ${phoneNumber}, expires at ${expiresAt.toISOString()}`);
      if (!bypassSMS) {
        console.log(`🔐 AFROMESSAGE OTP CODE FOR TESTING: ${smsResult.code}`);
      }

      return {
        id: otpCode.id,
        key: phoneNumber,
        code: smsResult.code,
        codeHash: smsResult.code,
        expiresAt: otpCode.expires_at,
        attempts: otpCode.attempts,
        maxAttempts: otpCode.max_attempts,
        createdAt: otpCode.created_at,
        verificationId: smsResult.verificationId,
        messageId: smsResult.messageId,
      };
    } catch (error) {
      this.logger.error(`Error creating OTP for ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Verify OTP for phone number (Database version)
   */
  async verifyOtpForPhone(phoneNumber: string, code: string, purpose: string = 'registration'): Promise<{ valid: boolean; message?: string }> {
    try {
      this.logger.log(`🔍 Verifying OTP for ${phoneNumber} with code ${code}`);

      // Find active OTP
      const otpRecord = await this.otpRepository.findValidOtp(phoneNumber, purpose);
      this.logger.log(`📋 OTP record found for ${phoneNumber}:`, otpRecord ? 'YES' : 'NO');

      if (!otpRecord) {
        return { valid: false, message: 'OTP not found or expired' };
      }

      // Check if max attempts exceeded
      if (otpRecord.attempts >= otpRecord.max_attempts) {
        this.logger.warn(`🚫 Max attempts exceeded for ${phoneNumber}`);
        return { valid: false, message: 'Maximum attempts exceeded' };
      }

      // Increment attempts
      await this.otpRepository.incrementAttempts(otpRecord.id);

      // Verify OTP against stored code
      const isValidCode = otpRecord.code_hash === code;

      this.logger.log(`✅ OTP verification result for ${phoneNumber}: ${isValidCode}`);

      if (isValidCode) {
        // Mark as used first (for audit trail)
        await this.otpRepository.markAsUsed(otpRecord.id);

        // Delete the OTP after successful verification (security best practice)
        await this.otpRepository.delete(otpRecord.id);

        this.logger.log(`🔐 OTP successfully verified and deleted for ${phoneNumber}`);
        return { valid: true };
      }

      return { valid: false, message: 'Invalid OTP code' };
    } catch (error) {
      this.logger.error(`Error verifying OTP for ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Store AfroMessage OTP in database for tracking
   */
  async storeAfroMessageOtp(
    phoneNumber: string,
    code: string,
    verificationId: string,
    messageId: string,
    ttlSeconds: number,
    purpose: string = 'login'
  ): Promise<any> {
    try {
      this.logger.log(`📝 Storing AfroMessage OTP for ${phoneNumber}`);

      // Clean up any existing OTPs for this phone number and purpose
      await this.otpRepository.deleteAllForPhoneAndPurpose(phoneNumber, purpose);

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + ttlSeconds);

      // Store OTP in database
      const otpCode = await this.otpRepository.create({
        phone_number: phoneNumber,
        code_hash: code, // Store as plain text since AfroMessage handles verification
        purpose: purpose as any,
        expires_at: expiresAt.toISOString(),
        max_attempts: 3,
        // TODO: Add verification_id and message_id after database migration
        // verification_id: verificationId,
        // message_id: messageId,
      });

      this.logger.log(`📝 AfroMessage OTP stored in database for ${phoneNumber}, expires at ${expiresAt.toISOString()}`);

      return {
        id: otpCode.id,
        phoneNumber: phoneNumber,
        code: code,
        verificationId: verificationId,
        messageId: messageId,
        expiresAt: otpCode.expires_at,
      };
    } catch (error) {
      this.logger.error(`Error storing AfroMessage OTP for ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Delete OTP after successful verification
   */
  async deleteOtpAfterVerification(phoneNumber: string, code: string): Promise<void> {
    try {
      this.logger.log(`🗑️ Deleting OTP after verification for ${phoneNumber}`);

      // Find the OTP record
      const otpRecord = await this.otpRepository.findValidOtp(phoneNumber, 'login');

      if (otpRecord && otpRecord.code_hash === code) {
        // Mark as used and delete
        await this.otpRepository.markAsUsed(otpRecord.id);
        await this.otpRepository.delete(otpRecord.id);
        this.logger.log(`✅ OTP deleted after successful verification for ${phoneNumber}`);
      }
    } catch (error) {
      this.logger.error(`Error deleting OTP after verification for ${phoneNumber}:`, error);
      throw error;
    }
  }

  /**
   * Generic create for arbitrary key (email/phone) - Legacy compatibility
   */
  async createOtpForKey(key: string, code: string, expiresInMinutes = 10): Promise<any> {
    // Assume it's a phone number for backward compatibility
    return this.createOtpForPhone(key, expiresInMinutes, 'registration');
  }

  /**
   * Find all OTPs for a phone number (for debugging)
   */
  async findOtpsForPhone(phoneNumber: string): Promise<any[]> {
    try {
      this.logger.log(`🔍 Finding OTPs for phone: ${phoneNumber}`);

      // Find all OTPs for this phone number
      const otps = await this.otpRepository.findMany({ phone_number: phoneNumber });

      this.logger.log(`📋 Found ${otps.length} OTP records for ${phoneNumber}`);
      return otps;
    } catch (error) {
      this.logger.error(`Error finding OTPs for ${phoneNumber}:`, error);
      throw error;
    }
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
      const deletedCount = await this.otpRepository.cleanupExpiredOtps();
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
   * Create OTP for email address
   */
  async createOtpForEmail(
    email: string,
    expiresInMinutes: number = 10,
    purpose: string = 'login'
  ): Promise<any> {
    try {
      this.logger.log(`📧 Creating email OTP for: ${email}`);

      // Clean up any existing OTPs for this email and purpose
      const existingCount = await this.otpRepository.deleteAllForPhoneAndPurpose(email, purpose);
      if (existingCount > 0) {
        this.logger.log(`🧹 Cleaned up ${existingCount} existing OTP(s) for ${email} with purpose ${purpose}`);
      }

      // Generate OTP code
      const otpCode = await this.generateOtp();

      // Store OTP in database (reuse phone_number field for email)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

      const otpCodeRecord = await this.otpRepository.create({
        phone_number: email, // Store email in phone_number field
        code_hash: otpCode,
        purpose: purpose as any,
        expires_at: expiresAt.toISOString(),
        max_attempts: 3,
      });

      // Send OTP via email
      await this.mailService.sendOtp(email, otpCode);

      this.logger.log(`📝 Email OTP stored in database for ${email}, expires at ${expiresAt.toISOString()}`);
      console.log(`🔐 EMAIL OTP CODE FOR TESTING: ${otpCode}`);

      return {
        id: otpCodeRecord.id,
        key: email,
        code: otpCode,
        codeHash: otpCode,
        expiresAt: otpCodeRecord.expires_at,
        attempts: otpCodeRecord.attempts,
        maxAttempts: otpCodeRecord.max_attempts,
        createdAt: otpCodeRecord.created_at,
      };
    } catch (error) {
      this.logger.error(`Error creating email OTP for ${email}:`, error);
      throw error;
    }
  }

  /**
   * Verify OTP for email address
   */
  async verifyOtpForEmail(email: string, code: string, purpose: string = 'login'): Promise<{ valid: boolean; message?: string }> {
    try {
      this.logger.log(`🔍 Verifying email OTP for ${email} with code ${code}`);

      // Find active OTP (reuse phone_number field for email)
      const otpRecord = await this.otpRepository.findValidOtp(email, purpose);
      this.logger.log(`📋 OTP record found for ${email}:`, otpRecord ? 'YES' : 'NO');

      if (!otpRecord) {
        return { valid: false, message: 'OTP not found or expired' };
      }

      // Check if max attempts exceeded
      if (otpRecord.attempts >= otpRecord.max_attempts) {
        this.logger.warn(`🚫 Max attempts exceeded for ${email}`);
        return { valid: false, message: 'Maximum attempts exceeded' };
      }

      // Increment attempts
      await this.otpRepository.incrementAttempts(otpRecord.id);

      // Verify OTP against stored code
      const isValidCode = otpRecord.code_hash === code;

      this.logger.log(`✅ Email OTP verification result for ${email}: ${isValidCode}`);

      if (isValidCode) {
        // Mark as used first (for audit trail)
        await this.otpRepository.markAsUsed(otpRecord.id);

        // Delete the OTP after successful verification (security best practice)
        await this.otpRepository.delete(otpRecord.id);

        this.logger.log(`🔐 Email OTP successfully verified and deleted for ${email}`);
        return { valid: true };
      }

      return { valid: false, message: 'Invalid OTP code' };
    } catch (error) {
      this.logger.error(`Error verifying email OTP for ${email}:`, error);
      throw error;
    }
  }

  /**
   * Clean up all OTPs for a phone number (useful after successful registration)
   */
  async cleanupAllOtpsForPhone(phoneE164: string): Promise<number> {
    try {
      const deletedCount = await this.otpRepository.deleteAllForPhoneAndPurpose(phoneE164, 'registration');
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

  /**
   * Find valid OTP for debugging (Database version)
   */
  async findValidOtp(phoneNumber: string, purpose: string = 'registration'): Promise<any> {
    try {
      return await this.otpRepository.findValidOtp(phoneNumber, purpose);
    } catch (error) {
      this.logger.error(`Error finding valid OTP for ${phoneNumber}:`, error);
      throw error;
    }
  }
}