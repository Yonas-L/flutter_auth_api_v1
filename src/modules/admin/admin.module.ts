import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [DatabaseModule, MailModule],
    controllers: [AdminController],
    providers: [AdminService],
    exports: [AdminService],
})
export class AdminModule { }
