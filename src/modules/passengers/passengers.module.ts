import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassengersController } from './passengers.controller';
import { PassengersService } from './passengers.service';
import { DatabaseModule } from '../database/database.module';
import { OtpModule } from '../otp/otp.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        DatabaseModule,
        OtpModule,
        AuthModule,
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get('JWT_SECRET') || configService.get('JWT_ACCESS_SECRET'),
                signOptions: { expiresIn: '30d' },
            }),
        }),
    ],
    controllers: [PassengersController],
    providers: [PassengersService],
    exports: [PassengersService],
})
export class PassengersModule { }
