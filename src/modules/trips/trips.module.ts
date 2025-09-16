import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripStatusSyncService } from './trip-status-sync.service';
import { DatabaseModule } from '../database/database.module';
import { DriverProfilesPostgresRepository } from '../database/repositories/driver-profiles-postgres.repository';
import { VehiclesPostgresRepository } from '../database/repositories/vehicles-postgres.repository';

@Module({
    imports: [DatabaseModule],
    controllers: [TripsController],
    providers: [
        TripsService,
        TripStatusSyncService,
        DriverProfilesPostgresRepository,
        VehiclesPostgresRepository,
    ],
    exports: [TripsService],
})
export class TripsModule { }
