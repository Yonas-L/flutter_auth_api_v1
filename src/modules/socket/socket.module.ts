import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SocketGateway } from './socket.gateway';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';

@Module({
    imports: [
        AuthModule,
        DatabaseModule,
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
