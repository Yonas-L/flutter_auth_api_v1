import { Body, Controller, Headers, HttpException, HttpStatus, Post, Get, Logger } from '@nestjs/common';
import { OtpService } from './otp.service';
import { AuthPostgresService } from '../auth/auth-postgres.service';

interface SendOtpBody {
  phoneNumber: string;
  purpose?: 'registration' | 'login' | 'password_reset' | 'phone_verification';
}

interface VerifyOtpBody {
  phoneNumber: string;
  otp: string;
  deviceId?: string;
  name?: string;
  purpose?: 'registration' | 'login' | 'password_reset' | 'phone_verification';
}

@Controller('otp')
export class OtpController {
  private readonly logger = new Logger(OtpController.name);

  constructor(
    private readonly otpService: OtpService,
    private readonly authPostgresService: AuthPostgresService,
  ) { }

  private requireBearer(@Headers('authorization') authHeader?: string) {
    const expected = process.env.SMS_TOKEN;
    if (!expected) {
      this.logger.warn('SMS_TOKEN not configured, skipping authentication');
      return; // Skip auth in dev
    }
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      throw new HttpException('Missing bearer token', HttpStatus.UNAUTHORIZED);
    }
    const token = authHeader.substring(7);
    if (token !== expected) {
      throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
    }
  }

  private validateEthiopianPhoneNumber(phone: string): boolean {
    // Validate Ethiopian phone number format
    const phoneRegex = /^(\+251|251|0)?[79]\d{8}$/;
    return phoneRegex.test(phone.replace(/\s+/g, ''));
  }

  private normalizePhoneNumber(phone: string): string {
    // Convert to E.164 format
    const cleaned = phone.replace(/\s+/g, '');
    if (cleaned.startsWith('0')) {
      return '+251' + cleaned.substring(1);
    }
    if (cleaned.startsWith('251')) {
      return '+' + cleaned;
    }
    if (cleaned.startsWith('+251')) {
      return cleaned;
    }
    throw new HttpException('Invalid phone number format', HttpStatus.BAD_REQUEST);
  }

  @Post('send')
  async send(@Body() body: SendOtpBody, @Headers('authorization') auth?: string) {
    this.requireBearer(auth);

    const phone = (body?.phoneNumber || '').trim();
    if (!phone) {
      throw new HttpException('phoneNumber is required', HttpStatus.BAD_REQUEST);
    }

    // Validate phone number format
    if (!this.validateEthiopianPhoneNumber(phone)) {
      throw new HttpException('Invalid Ethiopian phone number format', HttpStatus.BAD_REQUEST);
    }

    // Normalize phone number to E.164 format
    const normalizedPhone = this.normalizePhoneNumber(phone);
    const purpose = body.purpose || 'registration';

    this.logger.log(`Sending OTP to ${normalizedPhone} for purpose: ${purpose}`);

    try {
      // Let the OTP service handle everything (generation, SMS sending, and database storage)
      await this.otpService.createOtpForPhone(normalizedPhone, 10, purpose);

      this.logger.log(`OTP sent successfully to ${normalizedPhone}`);

      return {
        success: true,
        message: 'OTP sent successfully',
        phoneNumber: normalizedPhone
      };

    } catch (error) {
      this.logger.error(`Error sending OTP to ${normalizedPhone}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to send OTP', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('verify')
  async verify(@Body() body: VerifyOtpBody, @Headers('authorization') auth?: string) {
    this.requireBearer(auth);

    const phone = (body?.phoneNumber || '').trim();
    const otp = (body?.otp || '').trim();
    const purpose = body.purpose || 'registration';

    if (!phone || !otp) {
      throw new HttpException('phoneNumber and otp are required', HttpStatus.BAD_REQUEST);
    }

    // Validate phone number format
    if (!this.validateEthiopianPhoneNumber(phone)) {
      throw new HttpException('Invalid Ethiopian phone number format', HttpStatus.BAD_REQUEST);
    }

    // Normalize phone number
    const normalizedPhone = this.normalizePhoneNumber(phone);

    this.logger.log(`Verifying OTP for ${normalizedPhone} with purpose: ${purpose}`);

    try {
      // Verify OTP
      const result = await this.otpService.verifyOtpForPhone(normalizedPhone, otp, purpose);
      if (!result.valid) {
        this.logger.warn(`Invalid OTP attempt for ${normalizedPhone}: ${result.message}`);
        throw new HttpException(result.message || 'Invalid OTP', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`OTP verified successfully for ${normalizedPhone}`);

      // Create or get PostgreSQL user and issue tokens
      const tokens = await this.authPostgresService.createOrAuthenticateUser(normalizedPhone);

      this.logger.log(`User authenticated successfully for ${normalizedPhone}`);

      return {
        success: true,
        message: 'OTP verified successfully',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: tokens.user,
        phoneNumber: normalizedPhone
      };

    } catch (error) {
      this.logger.error(`Error verifying OTP for ${normalizedPhone}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to verify OTP', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('stats')
  async getStats(@Headers('authorization') auth?: string) {
    this.requireBearer(auth);

    try {
      const stats = await this.otpService.getOtpStats();
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      this.logger.error('Error getting OTP stats:', error);
      throw new HttpException('Failed to get OTP stats', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

}
