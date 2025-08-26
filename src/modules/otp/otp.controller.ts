import { Body, Controller, Headers, HttpException, HttpStatus, Post } from '@nestjs/common';
import { OtpService } from './otp.service';
import { SupabaseAuthService } from './supabase-auth.service';

interface SendOtpBody { phoneNumber: string }
interface VerifyOtpBody { phoneNumber: string; otp: string; deviceId?: string; name?: string }

@Controller('otp')
export class OtpController {
  constructor(
    private readonly otpService: OtpService,
    private readonly supaAuth: SupabaseAuthService,
  ) {}

  private requireBearer(@Headers('authorization') authHeader?: string) {
    const expected = process.env.SMS_TOKEN;
    if (!expected) return; // if not set, skip auth in dev
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      throw new HttpException('Missing bearer token', HttpStatus.UNAUTHORIZED);
    }
    const token = authHeader.substring(7);
    if (token !== expected) {
      throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
    }
  }

  @Post('send')
  async send(@Body() body: SendOtpBody, @Headers('authorization') auth?: string) {
    this.requireBearer(auth);
    const phone = (body?.phoneNumber || '').trim();
    if (!phone) throw new HttpException('phoneNumber is required', HttpStatus.BAD_REQUEST);

    const code = await this.otpService.generateOtp();
    const pr = process.env.AFRO_PR ?? 'Your verification code is';
    const ps = process.env.AFRO_PS ?? '';
    const message = `${pr} ${code}${ps ? ' ' + ps : ''}`;

    // AfroMessage config
    const apiUrl = 'https://api.afromessage.com/api/send';
    const from = process.env.AFRO_FROM || '';
    const sender = process.env.AFRO_SENDER || '';
    const afroToken = process.env.AFRO_SMS_KEY || '';

    const url = new URL(apiUrl);
    url.searchParams.set('from', from);
    if (sender) url.searchParams.set('sender', sender);
    url.searchParams.set('to', phone);
    url.searchParams.set('message', message);

    if (!afroToken) {
      // Dev mode: skip external call
      console.log(`[DEV] Skipping AfroMessage send. Phone=${phone} Code=${code} Message="${message}"`);
    } else {
      const resp = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${afroToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new HttpException(`AfroMessage error ${resp.status}: ${text}`, HttpStatus.BAD_GATEWAY);
      }
    }

    await this.otpService.createOtpForPhone(phone, code, 10);
    return { success: true };
  }

  @Post('verify')
  async verify(@Body() body: VerifyOtpBody, @Headers('authorization') auth?: string) {
    this.requireBearer(auth);
    const phone = (body?.phoneNumber || '').trim();
    const otp = (body?.otp || '').trim();
    if (!phone || !otp) throw new HttpException('phoneNumber and otp are required', HttpStatus.BAD_REQUEST);

    const result = await this.otpService.verifyOtpForPhone(phone, otp);
    if (!result.valid) {
      throw new HttpException(result.message || 'Invalid OTP', HttpStatus.BAD_REQUEST);
    }

    // Create/fetch Supabase user for this phone and issue tokens
    const tokens = await this.supaAuth.createOrGetTokens(phone, body?.name);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      expiresIn: tokens.expiresIn,
      user: tokens.user ?? undefined,
    };
  }
}
