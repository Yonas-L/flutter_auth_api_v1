import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
                secret: configService.get('JWT_ACCESS_SECRET'),
                signOptions: {
                    expiresIn: configService.get('ACCESS_EXPIRES_IN') || '15m',
                },
            }),
        }),
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
