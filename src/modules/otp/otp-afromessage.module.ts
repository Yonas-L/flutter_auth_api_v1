import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OtpAfroMessageController } from './otp-afromessage.controller';
import { AfroMessageService } from './afro-message.service';
import { OtpService } from './otp.service';
import { DatabaseModule } from '../database/database.module';
import { AuthPostgresService } from '../auth/auth-postgres.service';

@Module({
    imports: [
        DatabaseModule,
        JwtModule.registerAsync({
            useFactory: (configService: ConfigService) => ({
                secret: configService.get('JWT_ACCESS_SECRET'),
                signOptions: {
                    expiresIn: configService.get('ACCESS_EXPIRES_IN') || '15m',
                },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [OtpAfroMessageController],
    providers: [AfroMessageService, OtpService, AuthPostgresService],
    exports: [AfroMessageService, OtpService, AuthPostgresService],
})
export class OtpAfroMessageModule { }
