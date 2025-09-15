import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SimpleAuthService } from './simple-auth.service';
import { UsersModule } from '../users/users.module';
import { OtpModule } from '../otp/otp.module';
import { MailModule } from '../mail/mail.module';
import { DatabaseModule } from '../database/database.module';
import { AfroMessageService } from '../otp/afro-message.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get('ACCESS_EXPIRES_IN') || '15m',
        },
      }),
    }),
    UsersModule,
    OtpModule,
    MailModule,
    DatabaseModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, SimpleAuthService, JwtStrategy, AfroMessageService],
  exports: [AuthService, SimpleAuthService],
})
export class AuthModule { }
