import { Module } from '@nestjs/common';
import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';
import { DatabaseModule } from '../database/database.module';
import { CloudinaryModule } from '../storage/cloudinary.module';

@Module({
    imports: [DatabaseModule, CloudinaryModule],
    controllers: [AdsController],
    providers: [AdsService],
    exports: [AdsService],
})
export class AdsModule {}

