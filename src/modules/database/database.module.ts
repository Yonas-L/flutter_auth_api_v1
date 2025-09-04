import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database.service';
import { DatabaseController } from './database.controller';
import {
    UsersRepository,
    DriverProfilesRepository,
    VehiclesRepository,
    DocumentsRepository,
    OtpRepository
} from './repositories';

@Global()
@Module({
    imports: [ConfigModule],
    controllers: [DatabaseController],
    providers: [
        DatabaseService,
        UsersRepository,
        DriverProfilesRepository,
        VehiclesRepository,
        DocumentsRepository,
        OtpRepository,
    ],
    exports: [
        DatabaseService,
        UsersRepository,
        DriverProfilesRepository,
        VehiclesRepository,
        DocumentsRepository,
        OtpRepository,
    ],
})
export class DatabaseModule { }
