import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SocketGateway } from './socket.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        AuthModule,
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'your-secret-key',
            signOptions: { expiresIn: '24h' },
        }),
    ],
    providers: [SocketGateway],
    exports: [SocketGateway],
})
export class SocketModule { }
