import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripStatusSyncService } from './trip-status-sync.service';
import { DatabaseModule } from '../database/database.module';
import { AuthPostgresModule } from '../auth/auth-postgres.module';
import { DriverProfilesPostgresRepository } from '../database/repositories/driver-profiles-postgres.repository';
import { VehiclesPostgresRepository } from '../database/repositories/vehicles-postgres.repository';
import { SocketGateway } from '../socket/socket.gateway';

@Module({
    imports: [
        DatabaseModule,
        AuthPostgresModule, // For JWT authentication
    ],
    controllers: [TripsController],
    providers: [
        TripsService,
        TripStatusSyncService,
        DriverProfilesPostgresRepository,
        VehiclesPostgresRepository,
        SocketGateway,
    ],
    exports: [TripsService],
})
export class TripsModule { }
