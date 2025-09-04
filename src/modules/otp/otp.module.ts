import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { SupabaseAuthService } from './supabase-auth.service';
import { AfroMessageService } from './afro-message.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [OtpController],
  providers: [OtpService, SupabaseAuthService, AfroMessageService],
  exports: [OtpService, SupabaseAuthService, AfroMessageService],
})
export class OtpModule { }
