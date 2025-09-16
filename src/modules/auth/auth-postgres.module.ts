import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthPostgresService } from './auth-postgres.service';
import { AuthPostgresController } from './auth-postgres.controller';
import { JwtPostgresStrategy } from './strategies/jwt-postgres.strategy';
import { DatabaseModule } from '../database/database.module';
import { OtpModule } from '../otp/otp.module';
import { UsersModule } from '../users/users.module';

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
        DatabaseModule, // For UsersPostgresRepository
        OtpModule, // For OTP services
        UsersModule, // For UserStatusSyncService
    ],
    controllers: [AuthPostgresController],
    providers: [
        AuthPostgresService,
        JwtPostgresStrategy,
    ],
    exports: [AuthPostgresService, JwtPostgresStrategy],
})
export class AuthPostgresModule { }

