import { Module } from '@nestjs/common';
import { VehicleTypesController } from './vehicle-types.controller';
import { VehicleTypesPostgresService } from './vehicle-types-postgres.service';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [DatabaseModule],
    controllers: [VehicleTypesController],
    providers: [VehicleTypesPostgresService],
    exports: [VehicleTypesPostgresService],
})
export class VehicleTypesModule { }
