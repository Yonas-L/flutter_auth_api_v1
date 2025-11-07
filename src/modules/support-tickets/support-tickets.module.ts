import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';
import { DatabaseModule } from '../database/database.module';
import { AuthPostgresModule } from '../auth/auth-postgres.module';
import { SocketModule } from '../socket/socket.module';
import { CloudinaryModule } from '../storage/cloudinary.module';

@Module({
    imports: [
        DatabaseModule,
        AuthPostgresModule,
        CloudinaryModule, // Import CloudinaryModule for file uploads
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
    controllers: [SupportTicketsController],
    providers: [SupportTicketsService],
    exports: [SupportTicketsService],
})
export class SupportTicketsModule { }

