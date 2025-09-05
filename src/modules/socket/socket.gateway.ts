import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createClient } from '@supabase/supabase-js';

interface AuthenticatedSocket extends Socket {
    userId: string;
    userType: 'driver';
}

@Injectable()
@WebSocketGateway({
    cors: { origin: '*' },
    namespace: '/',
})
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(SocketGateway.name);
    private readonly connectedDrivers = new Map<string, AuthenticatedSocket>();

    private supabase;

    constructor(private jwtService: JwtService) {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth.token ||
                client.handshake.headers.authorization?.split(' ')[1];

            if (!token) {
                this.logger.warn(`Connection rejected: No token provided for ${client.id}`);
                client.disconnect();
                return;
            }

            // Verify Supabase JWT token
            const { data: { user }, error } = await this.supabase.auth.getUser(token);
            
            if (error || !user) {
                this.logger.warn(`Connection rejected: Invalid Supabase token for ${client.id}: ${error?.message}`);
                client.disconnect();
                return;
            }

            const userId = user.id;

            // Attach user info to socket
            (client as AuthenticatedSocket).userId = userId;
            (client as AuthenticatedSocket).userType = 'driver';

            // Store connected driver
            this.connectedDrivers.set(userId, client as AuthenticatedSocket);

            // Join driver room
            await client.join(`driver:${userId}`);

            this.logger.log(`Driver ${userId} connected with socket ${client.id}`);

            // Send connection confirmation
            client.emit('connected', {
                userId,
                userType: 'driver',
                message: 'Successfully connected to Arada Transport'
            });

        } catch (error) {
            this.logger.error(`Connection failed for ${client.id}:`, error.message);
            client.disconnect();
        }
    }

    async handleDisconnect(client: Socket) {
        const authClient = client as AuthenticatedSocket;
        if (authClient.userId) {
            this.connectedDrivers.delete(authClient.userId);
            this.logger.log(`Driver ${authClient.userId} disconnected`);
        }
    }

    // Get connected drivers count
    getConnectedDriversCount(): number {
        return this.connectedDrivers.size;
    }

    // Get all connected drivers
    getConnectedDrivers(): Map<string, AuthenticatedSocket> {
        return this.connectedDrivers;
    }

    // Send message to specific driver
    sendToDriver(userId: string, event: string, data: any): boolean {
        const driver = this.connectedDrivers.get(userId);
        if (driver) {
            driver.emit(event, data);
            return true;
        }
        return false;
    }

    // Broadcast to all connected drivers
    broadcastToDrivers(event: string, data: any): void {
        this.server.emit(event, data);
    }
}
