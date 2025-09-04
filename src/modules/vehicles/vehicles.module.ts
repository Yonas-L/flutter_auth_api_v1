import { Module } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';
import { VehicleClassesService } from './vehicle-classes.service';
import { VehicleClassesController } from './vehicle-classes.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [DatabaseModule],
    controllers: [VehiclesController, VehicleClassesController],
    providers: [VehiclesService, VehicleClassesService],
    exports: [VehiclesService, VehicleClassesService],
})
export class VehiclesModule { }
