import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) { }

  @Post('otp/request')
  async requestOtp(@Body() requestOtpDto: RequestOtpDto) {
    return this.authService.requestOtp(requestOtpDto.email);
  }

  @Post('otp/verify')
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto.email, verifyOtpDto.code);
  }

  @Post('otp/request-phone')
  async requestOtpForPhone(@Body() body: { phoneNumber: string }) {
    return this.authService.requestOtpForPhone(body.phoneNumber);
  }

  @Post('otp/verify-phone')
  async verifyOtpForPhone(@Body() body: { phoneNumber: string; code: string }) {
    return this.authService.verifyOtpForPhone(body.phoneNumber, body.code);
  }

  @Post('refresh')
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@Body() user: any) {
    return this.usersService.findById(user.id);
  }
}
