import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
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
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'your-secret-key',
            signOptions: { expiresIn: '30d' },
        }),
    ],
    controllers: [PassengersController],
    providers: [PassengersService],
    exports: [PassengersService],
})
export class PassengersModule { }
