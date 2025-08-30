import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { AfroMessageService } from '../otp/afro-message.service';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
    private otpService: OtpService,
    private mailService: MailService,
    private afroMessageService: AfroMessageService,
  ) { }

  async requestOtp(email: string): Promise<{ message: string }> {
    // Generate OTP
    const otp = await this.otpService.generateOtp();

    // Store OTP in database
    await this.otpService.createOtp(email, otp);

    // Send OTP via email
    await this.mailService.sendOtp(email, otp);

    return { message: 'OTP sent successfully' };
  }

  async verifyOtp(email: string, code: string): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    // Verify OTP
    const otpResult = await this.otpService.verifyOtp(email, code);

    if (!otpResult.valid) {
      throw new BadRequestException(otpResult.message);
    }

    // Find or create user
    let user = await this.usersService.findByEmail(email);
    if (!user) {
      user = await this.usersService.create({
        email,
        role: 'driver',
        status: 'active',
      });
    }

    // Generate tokens
    const payload = { email: user.email, sub: user._id };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('REFRESH_EXPIRES_IN') || '7d',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const newPayload = { email: user.email, sub: user._id };
      const accessToken = this.jwtService.sign(newPayload);

      return { accessToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async requestOtpForPhone(phoneNumber: string): Promise<{ message: string }> {
    // Generate OTP
    const otp = await this.otpService.generateOtp();

    // Store OTP in database
    await this.otpService.createOtpForPhone(phoneNumber, otp);

    // Send OTP via SMS using AfroMessage
    const smsResult = await this.afroMessageService.sendOtp(phoneNumber);

    if (!smsResult.success) {
      throw new BadRequestException(`Failed to send SMS: ${smsResult.error}`);
    }

    return { message: 'OTP sent successfully via SMS' };
  }

  async verifyOtpForPhone(phoneNumber: string, code: string): Promise<{ accessToken: string; refreshToken: string; user: any }> {
    // Verify OTP
    const otpResult = await this.otpService.verifyOtpForPhone(phoneNumber, code);

    if (!otpResult.valid) {
      throw new BadRequestException(otpResult.message);
    }

    // Find or create user by phone number
    let user = await this.usersService.findByPhone(phoneNumber);
    if (!user) {
      user = await this.usersService.create({
        phoneNumber,
        role: 'driver',
        status: 'active',
      });
    }

    // Generate tokens
    const payload = { phoneNumber: user.phoneNumber, sub: user._id };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('REFRESH_EXPIRES_IN') || '7d',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        name: user.name,
        role: user.role,
        status: user.status,
      },
    };
  }
}
