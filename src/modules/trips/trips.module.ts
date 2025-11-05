import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripStatusSyncService } from './trip-status-sync.service';
import { DatabaseModule } from '../database/database.module';
import { AuthPostgresModule } from '../auth/auth-postgres.module';
import { DriverProfilesPostgresRepository } from '../database/repositories/driver-profiles-postgres.repository';
import { VehiclesPostgresRepository } from '../database/repositories/vehicles-postgres.repository';
import { SocketModule } from '../socket/socket.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
    imports: [
        DatabaseModule,
        NotificationsModule,
        AuthPostgresModule, // For JWT authentication
        forwardRef(() => SocketModule), // Import SocketModule with forwardRef to resolve circular dependency
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
    ],
    exports: [TripsService],
})
export class TripsModule { }
