import { Body, Controller, Headers, HttpException, HttpStatus, Post, Logger } from '@nestjs/common';
import { OtpService } from './otp.service';
import { SupabaseAuthService } from './supabase-auth.service';

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
    private readonly supaAuth: SupabaseAuthService,
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
      // Generate OTP
      const code = await this.otpService.generateOtp();

      // Prepare message
      const pr = process.env.AFRO_PR ?? 'Your Arada Transport verification code is';
      const ps = process.env.AFRO_PS ?? 'valid for 10 minutes';
      const message = `${pr} ${code} ${ps}`;

      // AfroMessage configuration
      const apiUrl = 'https://api.afromessage.com/api/send';
      const from = process.env.AFRO_FROM || '';
      const sender = process.env.AFRO_SENDER || '';
      const afroToken = process.env.AFRO_SMS_KEY || '';

      // Debug logging
      this.logger.log(`[DEBUG] AFRO_SMS_KEY length: ${afroToken ? afroToken.length : 0}`);
      this.logger.log(`[DEBUG] AFRO_SMS_KEY first 20 chars: ${afroToken ? afroToken.substring(0, 20) + '...' : 'EMPTY'}`);
      this.logger.log(`[DEBUG] AFRO_FROM: ${from}`);
      this.logger.log(`[DEBUG] AFRO_SENDER: ${sender}`);

      const url = new URL(apiUrl);
      url.searchParams.set('from', from);
      if (sender) url.searchParams.set('sender', sender);
      url.searchParams.set('to', normalizedPhone);
      url.searchParams.set('message', message);

      this.logger.log(`AfroMessage URL: ${url.toString()}`);

      if (!afroToken) {
        // Development mode: skip external call
        this.logger.error(`[ERROR] AFRO_SMS_KEY is empty or undefined - SMS will not be sent!`);
        this.logger.error(`[ERROR] Environment variables: AFRO_SMS_KEY=${process.env.AFRO_SMS_KEY}`);
        this.logger.error(`[ERROR] All env vars: ${JSON.stringify({
          AFRO_SMS_KEY: process.env.AFRO_SMS_KEY ? 'SET' : 'NOT SET',
          AFRO_FROM: process.env.AFRO_FROM,
          AFRO_SENDER: process.env.AFRO_SENDER,
          NODE_ENV: process.env.NODE_ENV
        })}`);
        this.logger.warn(`[DEV] Skipping AfroMessage send. Phone=${normalizedPhone} Code=${code} Message="${message}"`);
      } else {
        // Send SMS via AfroMessage
        this.logger.log(`[DEBUG] Making AfroMessage request to: ${url.toString()}`);
        this.logger.log(`[DEBUG] Authorization header: Bearer ${afroToken.substring(0, 20)}...`);
        
        const resp = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${afroToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (!resp.ok) {
          const errorText = await resp.text();
          this.logger.error(`AfroMessage error ${resp.status}: ${errorText}`);
          throw new HttpException(`SMS service error: ${resp.status}`, HttpStatus.BAD_GATEWAY);
        }

        const responseData = await resp.json();
        this.logger.log(`AfroMessage response: ${JSON.stringify(responseData)}`);

        if (responseData.acknowledge !== 'success') {
          this.logger.error(`[ERROR] AfroMessage failed: ${JSON.stringify(responseData)}`);
          throw new HttpException(`SMS service error: ${responseData.response?.message || responseData.response?.errors || 'Unknown error'}`, HttpStatus.BAD_GATEWAY);
        }
        
        this.logger.log(`[SUCCESS] AfroMessage SMS sent successfully! Message ID: ${responseData.response?.message_id}`);
      }

      // Store OTP in database
      await this.otpService.createOtpForPhone(normalizedPhone, code, 10);

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
      const result = await this.otpService.verifyOtpForPhone(normalizedPhone, otp);
      if (!result.valid) {
        this.logger.warn(`Invalid OTP attempt for ${normalizedPhone}: ${result.message}`);
        throw new HttpException(result.message || 'Invalid OTP', HttpStatus.BAD_REQUEST);
      }

      this.logger.log(`OTP verified successfully for ${normalizedPhone}`);

      // Create or get Supabase user and issue tokens
      const tokens = await this.supaAuth.createOrGetTokens(normalizedPhone, body?.name);

      this.logger.log(`User authenticated successfully for ${normalizedPhone}`);

      return {
        success: true,
        message: 'OTP verified successfully',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenType: tokens.tokenType,
        expiresIn: tokens.expiresIn,
        user: tokens.user ?? undefined,
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
}
