import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { OtpController } from './otp.controller';
import { SupabaseAuthService } from './supabase-auth.service';
import { AfroMessageService } from './afro-message.service';
import { DatabaseModule } from '../database/database.module';
import { AuthPostgresService } from '../auth/auth-postgres.service';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { OtpEmailController } from './otp-email.controller';

@Module({
  imports: [
    DatabaseModule,
    MailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get('ACCESS_EXPIRES_IN') || '15m',
        },
      }),
    }),
    forwardRef(() => UsersModule),
  ],
  controllers: [OtpController, OtpEmailController],
  providers: [OtpService, SupabaseAuthService, AfroMessageService, AuthPostgresService],
  exports: [OtpService, SupabaseAuthService, AfroMessageService, AuthPostgresService],
})
export class OtpModule { }
