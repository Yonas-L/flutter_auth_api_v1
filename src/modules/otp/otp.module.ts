import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { SupabaseAuthService } from './supabase-auth.service';

@Module({
  controllers: [OtpController],
  providers: [OtpService, SupabaseAuthService],
  exports: [OtpService, SupabaseAuthService],
})
export class OtpModule {}
