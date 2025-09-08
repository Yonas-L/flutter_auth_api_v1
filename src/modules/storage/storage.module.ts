import { Module } from '@nestjs/common';
import { LocalStorageService } from './local-storage.service';
import { FileServeController } from './file-serve.controller';

@Module({
    controllers: [FileServeController],
    providers: [LocalStorageService],
    exports: [LocalStorageService],
})
export class StorageModule { }
