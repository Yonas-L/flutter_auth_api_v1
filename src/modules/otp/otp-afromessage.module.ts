import { Module } from '@nestjs/common';
import { OtpAfroMessageController } from './otp-afromessage.controller';
import { AfroMessageService } from './afro-message.service';
import { OtpService } from './otp.service';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [DatabaseModule],
    controllers: [OtpAfroMessageController],
    providers: [AfroMessageService, OtpService],
    exports: [AfroMessageService, OtpService],
})
export class OtpAfroMessageModule { }
