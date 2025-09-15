import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    SubscribeMessage,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersPostgresRepository } from '../database/repositories/users-postgres.repository';

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
    private readonly availableDrivers = new Map<string, AuthenticatedSocket>();

    constructor(
        private jwtService: JwtService,
        private usersRepository: UsersPostgresRepository,
    ) { }

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth.token ||
                client.handshake.headers.authorization?.split(' ')[1];

            if (!token) {
                this.logger.warn(`Connection rejected: No token provided for ${client.id}`);
                client.disconnect();
                return;
            }

            // Verify custom JWT token using our PostgreSQL validation
            let payload;
            try {
                payload = this.jwtService.verify(token);
            } catch (error) {
                this.logger.warn(`Connection rejected: Invalid JWT token for ${client.id}: ${error.message}`);
                client.disconnect();
                return;
            }

            const userId = payload.sub;
            if (!userId) {
                this.logger.warn(`Connection rejected: No user ID in token for ${client.id}`);
                client.disconnect();
                return;
            }

            // Verify user exists in our PostgreSQL database
            const user = await this.usersRepository.findById(userId);
            if (!user) {
                this.logger.warn(`Connection rejected: User not found for ${client.id}: ${userId}`);
                client.disconnect();
                return;
            }

            // Check if user is active
            if (!user.is_active) {
                this.logger.warn(`Connection rejected: User account deactivated for ${client.id}: ${userId}`);
                client.disconnect();
                return;
            }

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
            // Remove from connected drivers
            this.connectedDrivers.delete(authClient.userId);

            // Remove from available drivers
            this.availableDrivers.delete(authClient.userId);

            // Update database - set offline
            await this.updateDriverStatus(authClient.userId, {
                is_online: false,
                is_available: false,
                socket_id: null
            });

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

    // ==========================================
    // Driver Availability Management
    // ==========================================

    @SubscribeMessage('driver:set_availability')
    async handleSetAvailability(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { available: boolean; location?: { lat: number; lng: number } }
    ) {
        try {
            const { available, location } = data;
            const userId = client.userId;

            if (available) {
                // Add to available drivers
                this.availableDrivers.set(userId, client);
                await client.join('available_drivers');

                // Update location if provided
                if (location) {
                    await this.updateDriverLocation(userId, location);
                }

                this.logger.log(`Driver ${userId} is now available`);
            } else {
                // Remove from available drivers
                this.availableDrivers.delete(userId);
                await client.leave('available_drivers');

                this.logger.log(`Driver ${userId} is no longer available`);
            }

            // Update database
            await this.updateDriverStatus(userId, {
                is_available: available,
                is_online: true,
                socket_id: client.id
            });

            // Notify driver of status change
            client.emit('driver:availability_updated', {
                available,
                message: available ? 'You are now available for rides' : 'You are no longer available'
            });

        } catch (error) {
            this.logger.error(`Error setting driver availability:`, error);
            client.emit('error', { message: 'Failed to update availability status' });
        }
    }

    // ==========================================
    // Location Tracking
    // ==========================================

    @SubscribeMessage('driver:location_update')
    async handleLocationUpdate(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { lat: number; lng: number; accuracy?: number }
    ) {
        try {
            const { lat, lng, accuracy } = data;
            const userId = client.userId;

            // Update driver location in database
            await this.updateDriverLocation(userId, { lat, lng });

            this.logger.debug(`Driver ${userId} location updated: ${lat}, ${lng}`);

            // Acknowledge location update
            client.emit('driver:location_acknowledged', {
                timestamp: new Date().toISOString(),
                accuracy
            });

        } catch (error) {
            this.logger.error(`Error updating driver location:`, error);
            client.emit('error', { message: 'Failed to update location' });
        }
    }

    // ==========================================
    // Database Update Methods
    // ==========================================

    private async updateDriverStatus(userId: string, updates: {
        is_online?: boolean;
        is_available?: boolean;
        socket_id?: string | null;
    }) {
        try {
            // For now, we'll just log the status update
            // In a full implementation, you'd update the driver_profiles table
            this.logger.log(`Driver status update for ${userId}:`, updates);

            // TODO: Implement PostgreSQL update for driver_profiles table
            // This would require adding a driver profiles repository

        } catch (error) {
            this.logger.error(`Error updating driver status:`, error);
        }
    }

    private async updateDriverLocation(userId: string, location: { lat: number; lng: number }) {
        try {
            // For now, we'll just log the location update
            // In a full implementation, you'd update the driver_profiles table with PostGIS
            this.logger.log(`Driver location update for ${userId}:`, location);

            // TODO: Implement PostgreSQL update for driver_profiles table with PostGIS
            // This would require adding a driver profiles repository with location support

        } catch (error) {
            this.logger.error(`Error updating driver location:`, error);
        }
    }

    // ==========================================
    // Enhanced Utility Methods
    // ==========================================

    getAvailableDrivers(): AuthenticatedSocket[] {
        return Array.from(this.availableDrivers.values());
    }

    getAvailableDriversCount(): number {
        return this.availableDrivers.size;
    }

    isDriverAvailable(userId: string): boolean {
        return this.availableDrivers.has(userId);
    }

    getDriverById(userId: string): AuthenticatedSocket | undefined {
        return this.connectedDrivers.get(userId);
    }
}
