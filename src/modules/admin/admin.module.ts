import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DriverFlagsController } from './driver-flags.controller';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';
import { SocketModule } from '../socket/socket.module';

@Module({
    imports: [DatabaseModule, MailModule, SocketModule],
    controllers: [AdminController, DriverFlagsController],
    providers: [AdminService],
    exports: [AdminService],
})
export class AdminModule { }
