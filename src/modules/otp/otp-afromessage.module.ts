import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OtpAfroMessageController } from './otp-afromessage.controller';
import { AfroMessageService } from './afro-message.service';
import { OtpService } from './otp.service';
import { DatabaseModule } from '../database/database.module';
import { AuthPostgresService } from '../auth/auth-postgres.service';
import { SimpleAuthService } from '../auth/simple-auth.service';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [
        DatabaseModule,
        MailModule,
        JwtModule.registerAsync({
            useFactory: (configService: ConfigService) => ({
                secret: configService.get('JWT_ACCESS_SECRET'),
                signOptions: {
                    expiresIn: configService.get('ACCESS_EXPIRES_IN') || '15m',
                },
            }),
            inject: [ConfigService],
        }),
        forwardRef(() => UsersModule),
    ],
    controllers: [OtpAfroMessageController],
    providers: [AfroMessageService, OtpService, AuthPostgresService, SimpleAuthService],
    exports: [AfroMessageService, OtpService, AuthPostgresService],
})
export class OtpAfroMessageModule { }
