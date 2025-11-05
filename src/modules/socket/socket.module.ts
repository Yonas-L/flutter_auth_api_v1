import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SocketGateway } from './socket.gateway';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { DriverProfilesModule } from '../driver-profiles/driver-profiles.module';
import { TripsModule } from '../trips/trips.module';

@Module({
    imports: [
        AuthModule,
        DatabaseModule,
        DriverProfilesModule,
        forwardRef(() => TripsModule), // Import TripsModule with forwardRef to resolve circular dependency
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
    providers: [SocketGateway],
    exports: [SocketGateway],
})
export class SocketModule { }
