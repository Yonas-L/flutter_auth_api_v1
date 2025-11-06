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
import { Injectable, Logger, UnauthorizedException, forwardRef, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersPostgresRepository } from '../database/repositories/users-postgres.repository';
import { DriverProfilesPostgresRepository } from '../database/repositories/driver-profiles-postgres.repository';
import { PostgresService } from '../database/postgres.service';
import { TripsService } from '../trips/trips.service';

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
        @Inject(forwardRef(() => TripsService))
        private tripsService: TripsService,
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

            // Register socket id only; do NOT change online state on mere connection
            await this.updateDriverStatus(userId, {
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

            // Determine online status strictly from explicit flag.
            // If 'online' is not provided, do NOT change online state here.
            const isOnline: boolean | undefined = online !== undefined ? online : undefined;

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

            // Update database, but only touch is_online when explicitly provided
            this.logger.log(`🔄 Updating database for driver ${userId}: available=${available}${isOnline !== undefined ? ", online=" + isOnline : ''}`);
            const updated = await this.updateDriverStatus(userId, Object.assign(
                {
                    is_available: available,
                    socket_id: client.id,
                },
                isOnline !== undefined ? { is_online: isOnline } : {}
            ));

            // Notify driver of status change (use persisted values if available)
            const onlineToEmit = updated?.is_online ?? (isOnline ?? false);
            const availableToEmit = updated?.is_available ?? available;
            client.emit('driver:availability_updated', {
                available: availableToEmit,
                online: onlineToEmit,
                message: onlineToEmit ?
                    (availableToEmit ? 'You are now available for rides' : 'You are online but not available') :
                    'You are offline'
            });

            // Broadcast status change to dashboard clients
            this.logger.log(`📡 Attempting to broadcast to ${this.dashboardClients.size} dashboard clients`);
            this.dashboardClients.forEach((dashboardClient, clientId) => {
                this.logger.log(`📡 Broadcasting to dashboard client: ${clientId}`);

                // Emit detailed driver status event
                dashboardClient.emit('driver:status_changed', {
                    driverId: userId,
                    userId: userId, // Add userId for consistency
                    available: availableToEmit,
                    online: onlineToEmit,
                    timestamp: new Date().toISOString()
                });

                // Emit specific availability event
                dashboardClient.emit('driver:availability_changed', {
                    driverId: userId,
                    userId: userId,
                    available: availableToEmit,
                    online: onlineToEmit,
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

            // Check if driver has an accepted trip and calculate arrival
            const driverProfile = await this.driverProfilesRepository.findByUserId(userId);
            if (driverProfile && driverProfile.current_trip_id) {
                // Get trip details
                const tripQuery = 'SELECT * FROM trips WHERE id = $1 AND status = $2';
                const tripResult = await this.postgresService.query(tripQuery, [
                    driverProfile.current_trip_id,
                    'accepted'
                ]);

                if (tripResult.rows.length > 0) {
                    const trip = tripResult.rows[0];
                    const pickupLat = trip.pickup_latitude;
                    const pickupLng = trip.pickup_longitude;

                    if (pickupLat && pickupLng) {
                        // Calculate distance to pickup
                        const distanceToPickup = this.calculateDistance(lat, lng, pickupLat, pickupLng);
                        
                        // Calculate bearing
                        const bearing = this.calculateBearing(lat, lng, pickupLat, pickupLng);

                        // Emit location with distance info to driver
                        client.emit('trip:driver_location', {
                            lat,
                            lng,
                            bearing,
                            distanceToPickup,
                            timestamp: new Date().toISOString()
                        });

                        // Check for arrival (within 200 meters)
                        if (distanceToPickup < 200) {
                            this.logger.log(`✅ Driver ${userId} has arrived at pickup (${distanceToPickup.toFixed(0)}m away)`);
                            client.emit('driver:arrived', {
                                tripId: trip.id,
                                distanceToPickup,
                                timestamp: new Date().toISOString()
                            });
                        }
                    }
                }
            }

            // Acknowledge location update
            client.emit('driver:location_acknowledged', {
                timestamp: new Date().toISOString(),
                accuracy
            });

            // Broadcast location update to dashboard clients
            this.dashboardClients.forEach((dashboardClient, clientId) => {
                dashboardClient.emit('driver:location_changed', {
                    driverId: userId,
                    userId: userId,
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
    // Support Trip Handlers
    // ==========================================

    @SubscribeMessage('trip_support_accept')
    async handleSupportTripAccept(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { tripId: string; passengerPhone?: string }
    ) {
        try {
            const driverUserId = client.userId;
            const { tripId } = data;

            this.logger.log(`📞 Driver ${driverUserId} accepting support trip ${tripId}`);

            // Call trips service to assign driver to trip
            const result = await this.tripsService.acceptSupportTrip(tripId, driverUserId);

            if (result.success) {
                this.logger.log(`✅ Support trip ${tripId} accepted by driver ${driverUserId}`);
                
                // Emit success to the accepting driver
                client.emit('trip_support_accepted', {
                    tripId,
                    trip: result.trip,
                    message: 'Trip accepted successfully'
                });

                // Notify other drivers that this trip was taken
                this.connectedDrivers.forEach((driverClient, userId) => {
                    if (userId !== driverUserId) {
                        driverClient.emit('trip_support_accepted_by_other', {
                            tripId,
                            message: 'This trip was accepted by another driver'
                        });
                    }
                });

            } else {
                this.logger.warn(`❌ Failed to accept support trip ${tripId}: ${result.error}`);
                client.emit('trip_support_accept_failed', {
                    tripId,
                    error: result.error || 'Failed to accept trip'
                });
            }

        } catch (error) {
            this.logger.error(`Error handling trip_support_accept:`, error);
            client.emit('error', { message: 'Failed to accept trip' });
        }
    }

    @SubscribeMessage('trip_support_decline')
    async handleSupportTripDecline(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { tripId: string; reason?: string; userInitiated?: boolean }
    ) {
        try {
            const driverUserId = client.userId;
            const { tripId, reason, userInitiated = true } = data;

            this.logger.log(`📞 Driver ${driverUserId} declining support trip ${tripId} (reason: ${reason})`);

            // Call trips service to handle decline and move to next driver
            await this.tripsService.declineSupportTrip(tripId, driverUserId, reason);

            // Acknowledge decline
            client.emit('trip_support_declined', {
                tripId,
                message: 'Trip declined'
            });

            this.logger.log(`✅ Support trip ${tripId} declined by driver ${driverUserId}`);

        } catch (error) {
            this.logger.error(`Error handling trip_support_decline:`, error);
            client.emit('error', { message: 'Failed to decline trip' });
        }
    }

    // ==========================================
    // Helper Methods - Distance & Bearing Calculations
    // ==========================================

    /**
     * Calculate distance between two points using Haversine formula
     * @returns Distance in meters
     */
    private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371e3; // Earth radius in meters
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δφ = ((lat2 - lat1) * Math.PI) / 180;
        const Δλ = ((lng2 - lng1) * Math.PI) / 180;

        const a =
            Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    /**
     * Calculate bearing between two points
     * @returns Bearing in degrees (0-360)
     */
    private calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const φ1 = (lat1 * Math.PI) / 180;
        const φ2 = (lat2 * Math.PI) / 180;
        const Δλ = ((lng2 - lng1) * Math.PI) / 180;

        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        const θ = Math.atan2(y, x);

        return ((θ * 180) / Math.PI + 360) % 360; // Normalize to 0-360
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

            // Enforce invariant: available only when online AND no current_trip_id
            const nextOnline = updates.is_online !== undefined ? updates.is_online : driverProfile.is_online;
            let nextAvailable = updates.is_available !== undefined ? updates.is_available : driverProfile.is_available;
            if (!nextOnline || driverProfile.current_trip_id) {
                nextAvailable = false;
            }

            // Update driver profile with coerced status
            this.logger.log(`🔄 Attempting to update driver profile with:`, {
                is_online: nextOnline,
                is_available: nextAvailable,
                socket_id: updates.socket_id || undefined,
            });

            const updatedProfile = await this.driverProfilesRepository.update(driverProfile.id, {
                is_online: nextOnline,
                is_available: nextAvailable,
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

            return updatedProfile;

        } catch (error) {
            this.logger.error(`❌ Error updating driver status for ${userId}:`, error);
            return undefined;
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

    // ==========================================
    // Ticket Event Broadcasting Methods
    // ==========================================

    /**
     * Broadcast ticket created event
     */
    broadcastTicketCreated(ticketId: string, userId: string) {
        try {
            this.logger.log(`📡 Broadcasting ticket created: ${ticketId} by user ${userId}`);

            // Broadcast to dashboard clients
            this.dashboardClients.forEach((dashboardClient) => {
                dashboardClient.emit('ticket:created', {
                    ticketId,
                    userId,
                    timestamp: new Date().toISOString(),
                });
            });

            this.logger.log(`📡 Broadcasted ticket created to ${this.dashboardClients.size} dashboard clients`);
        } catch (error) {
            this.logger.error(`❌ Error broadcasting ticket created:`, error);
        }
    }

    /**
     * Broadcast ticket updated event
     */
    broadcastTicketUpdated(ticketId: string, changes: any) {
        try {
            this.logger.log(`📡 Broadcasting ticket updated: ${ticketId}`);

            // Broadcast to ticket room
            this.server.to(`ticket:${ticketId}`).emit('ticket:updated', {
                ticketId,
                changes,
                timestamp: new Date().toISOString(),
            });

            // Broadcast to dashboard clients
            this.dashboardClients.forEach((dashboardClient) => {
                dashboardClient.emit('ticket:updated', {
                    ticketId,
                    changes,
                    timestamp: new Date().toISOString(),
                });
            });

            this.logger.log(`📡 Broadcasted ticket updated to ticket room and ${this.dashboardClients.size} dashboard clients`);
        } catch (error) {
            this.logger.error(`❌ Error broadcasting ticket updated:`, error);
        }
    }

    /**
     * Broadcast ticket assigned event
     */
    broadcastTicketAssigned(ticketId: string, assignedToUserId: string) {
        try {
            this.logger.log(`📡 Broadcasting ticket assigned: ${ticketId} to user ${assignedToUserId}`);

            // Broadcast to ticket room
            this.server.to(`ticket:${ticketId}`).emit('ticket:assigned', {
                ticketId,
                assignedToUserId,
                timestamp: new Date().toISOString(),
            });

            // Broadcast to dashboard clients
            this.dashboardClients.forEach((dashboardClient) => {
                dashboardClient.emit('ticket:assigned', {
                    ticketId,
                    assignedToUserId,
                    timestamp: new Date().toISOString(),
                });
            });

            this.logger.log(`📡 Broadcasted ticket assigned to ticket room and ${this.dashboardClients.size} dashboard clients`);
        } catch (error) {
            this.logger.error(`❌ Error broadcasting ticket assigned:`, error);
        }
    }

    /**
     * Broadcast ticket response added event
     */
    broadcastTicketResponseAdded(
        ticketId: string,
        responseId: string,
        userId: string,
        message: string,
        createdAt: Date,
        userType?: string,
    ) {
        try {
            this.logger.log(`📡 Broadcasting ticket response added: ${responseId} to ticket ${ticketId} by user type: ${userType}`);

            const eventData = {
                ticketId,
                responseId,
                userId,
                message,
                userType, // Include user_type to identify driver vs support responses
                createdAt: createdAt.toISOString(),
                timestamp: new Date().toISOString(),
            };

            // Broadcast to ticket room
            this.server.to(`ticket:${ticketId}`).emit('ticket:response_added', eventData);

            // Broadcast to dashboard clients
            this.dashboardClients.forEach((dashboardClient) => {
                dashboardClient.emit('ticket:response_added', eventData);
            });

            this.logger.log(`📡 Broadcasted ticket response added to ticket room and ${this.dashboardClients.size} dashboard clients`);
        } catch (error) {
            this.logger.error(`❌ Error broadcasting ticket response added:`, error);
        }
    }
}
