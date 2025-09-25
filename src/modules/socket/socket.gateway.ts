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
import { DriverProfilesPostgresRepository } from '../database/repositories/driver-profiles-postgres.repository';
import { PostgresService } from '../database/postgres.service';

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
    private readonly dashboardClients = new Map<string, Socket>();

    constructor(
        private jwtService: JwtService,
        private usersRepository: UsersPostgresRepository,
        private driverProfilesRepository: DriverProfilesPostgresRepository,
        private postgresService: PostgresService,
    ) { }

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth.token ||
                client.handshake.headers.authorization?.split(' ')[1];

            // Check if this is a dashboard connection (no token required)
            const isDashboardConnection = client.handshake.query.dashboard === 'true' ||
                client.handshake.headers['x-dashboard'] === 'true';

            if (!token && !isDashboardConnection) {
                this.logger.warn(`Connection rejected: No token provided for ${client.id}`);
                client.disconnect();
                return;
            }

            // Handle dashboard connections without authentication
            if (isDashboardConnection && !token) {
                this.dashboardClients.set(client.id, client);
                this.logger.log(`📊 Dashboard client connected: ${client.id} (Total dashboard clients: ${this.dashboardClients.size})`);
                this.logger.log(`📊 Dashboard client query:`, client.handshake.query);
                client.emit('dashboard:connected', {
                    message: 'Connected to dashboard',
                    timestamp: new Date().toISOString()
                });
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

            // Update driver status to online
            await this.updateDriverStatus(userId, {
                is_online: true,
                socket_id: client.id
            });

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
        } else {
            // Check if it's a dashboard client
            if (this.dashboardClients.has(client.id)) {
                this.dashboardClients.delete(client.id);
                this.logger.log(`Dashboard client disconnected: ${client.id} (Total dashboard clients: ${this.dashboardClients.size})`);
            }
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
        @MessageBody() data: { available: boolean; online?: boolean; location?: { lat: number; lng: number } }
    ) {
        try {
            const { available, online, location } = data;
            const userId = client.userId;

            // Determine online status - if not provided, assume online when available
            const isOnline = online !== undefined ? online : available;

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

            // Update database with both online and available status
            this.logger.log(`🔄 Updating database for driver ${userId}: available=${available}, online=${isOnline}`);
            await this.updateDriverStatus(userId, {
                is_available: available,
                is_online: isOnline,
                socket_id: client.id
            });

            // Notify driver of status change
            client.emit('driver:availability_updated', {
                available,
                online: isOnline,
                message: isOnline ?
                    (available ? 'You are now available for rides' : 'You are online but not available') :
                    'You are offline'
            });

            // Broadcast status change to dashboard clients
            this.logger.log(`📡 Attempting to broadcast to ${this.dashboardClients.size} dashboard clients`);
            this.dashboardClients.forEach((dashboardClient, clientId) => {
                this.logger.log(`📡 Broadcasting to dashboard client: ${clientId}`);

                // Emit detailed driver status event
                dashboardClient.emit('driver:status_updated', {
                    driverId: userId,
                    userId: userId, // Add userId for consistency
                    available,
                    online: isOnline,
                    timestamp: new Date().toISOString()
                });

                // Emit specific availability event
                dashboardClient.emit('driver:availability_updated', {
                    driverId: userId,
                    userId: userId,
                    available,
                    online: isOnline,
                    timestamp: new Date().toISOString()
                });
            });

            this.logger.log(`📡 Broadcasted driver status update to ${this.dashboardClients.size} dashboard clients: ${userId} - online: ${isOnline}, available: ${available}`);

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

            // Broadcast location update to dashboard clients
            this.dashboardClients.forEach((dashboardClient, clientId) => {
                dashboardClient.emit('driver:location_updated', {
                    driverId: userId,
                    lat,
                    lng,
                    accuracy,
                    timestamp: new Date().toISOString()
                });
            });

            this.logger.log(`📡 Broadcasted driver location update to ${this.dashboardClients.size} dashboard clients: ${userId}`);

        } catch (error) {
            this.logger.error(`Error updating driver location:`, error);
            client.emit('error', { message: 'Failed to update location' });
        }
    }

    // ==========================================
    // Database Update Methods
    // ==========================================

    // Broadcast trip status changes to dashboard clients
    async broadcastTripStatusChange(tripId: string, driverId: string, status: string) {
        try {
            this.logger.log(`📡 Broadcasting trip status change: ${tripId} - ${status} for driver ${driverId}`);

            this.dashboardClients.forEach((dashboardClient, clientId) => {
                this.logger.log(`📡 Broadcasting trip status to dashboard client: ${clientId}`);

                dashboardClient.emit('trip:status_changed', {
                    tripId,
                    driverId,
                    status,
                    timestamp: new Date().toISOString()
                });
            });

            this.logger.log(`📡 Broadcasted trip status change to ${this.dashboardClients.size} dashboard clients`);
        } catch (error) {
            this.logger.error(`❌ Error broadcasting trip status change:`, error);
        }
    }

    private async updateDriverStatus(userId: string, updates: {
        is_online?: boolean;
        is_available?: boolean;
        socket_id?: string | null;
    }) {
        try {
            this.logger.log(`🔄 Driver status update for ${userId}:`, updates);

            // Find driver profile by user ID
            const driverProfile = await this.driverProfilesRepository.findByUserId(userId);
            if (!driverProfile) {
                this.logger.error(`❌ Driver profile not found for user ${userId}`);
                return;
            }

            this.logger.log(`📋 Found driver profile ${driverProfile.id} for user ${userId}`);
            this.logger.log(`📋 Current driver profile status:`, {
                is_online: driverProfile.is_online,
                is_available: driverProfile.is_available,
                socket_id: driverProfile.socket_id
            });

            // Update driver profile with new status
            this.logger.log(`🔄 Attempting to update driver profile with:`, {
                is_online: updates.is_online,
                is_available: updates.is_available,
                socket_id: updates.socket_id || undefined,
            });

            const updatedProfile = await this.driverProfilesRepository.update(driverProfile.id, {
                is_online: updates.is_online,
                is_available: updates.is_available,
                socket_id: updates.socket_id || undefined,
            });

            if (updatedProfile) {
                this.logger.log(`✅ Driver status updated successfully for ${userId}:`, {
                    is_online: updatedProfile.is_online,
                    is_available: updatedProfile.is_available,
                    socket_id: updatedProfile.socket_id
                });
            } else {
                this.logger.error(`❌ Failed to update driver status for ${userId} - update returned null`);
            }

        } catch (error) {
            this.logger.error(`❌ Error updating driver status for ${userId}:`, error);
        }
    }

    private async updateDriverLocation(userId: string, location: { lat: number; lng: number }) {
        try {
            this.logger.log(`Driver location update for ${userId}:`, location);

            // Find driver profile by user ID
            const driverProfile = await this.driverProfilesRepository.findByUserId(userId);
            if (!driverProfile) {
                this.logger.error(`Driver profile not found for user ${userId}`);
                return;
            }

            // Update driver profile with new location using direct SQL query
            const updateLocationQuery = `
                UPDATE driver_profiles 
                SET last_known_location = ST_Point($1, $2)::point,
                    last_location_update = $3,
                    updated_at = NOW()
                WHERE id = $4
            `;

            await this.postgresService.query(updateLocationQuery, [
                location.lng,
                location.lat,
                new Date().toISOString(),
                driverProfile.id
            ]);

            this.logger.log(`✅ Driver location updated successfully for ${userId}`);

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
