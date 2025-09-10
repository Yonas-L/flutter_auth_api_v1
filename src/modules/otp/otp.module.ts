import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { SupabaseAuthService } from './supabase-auth.service';
import { AfroMessageService } from './afro-message.service';
import { DatabaseModule } from '../database/database.module';
import { AuthPostgresService } from '../auth/auth-postgres.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OtpController],
  providers: [OtpService, SupabaseAuthService, AfroMessageService, AuthPostgresService],
  exports: [OtpService, SupabaseAuthService, AfroMessageService, AuthPostgresService],
})
export class OtpModule { }
