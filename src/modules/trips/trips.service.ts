import { Injectable, Logger, HttpException, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';
import { DriverProfilesPostgresRepository } from '../database/repositories/driver-profiles-postgres.repository';
import { VehiclesPostgresRepository } from '../database/repositories/vehicles-postgres.repository';
import { TripStatusSyncService } from './trip-status-sync.service';
import { SocketGateway } from '../socket/socket.gateway';
import { NotificationsService } from '../../notifications/notifications.service';

export interface DispatcherTripDto {
    pickup_address: string;
    dropoff_address: string;
    pickup_latitude: number;
    pickup_longitude: number;
    dropoff_latitude: number;
    dropoff_longitude: number;
    trip_type?: string;
    passenger_phone?: string;
    passenger_name?: string;
    recipient_name?: string; // For delivery trips - name shown to driver
    vehicle_type_id?: number;
    estimated_distance_km?: number;
    estimated_duration_minutes?: number;
    estimated_fare?: number;
    trip_details?: {
        passenger_name?: string;
        special_instructions?: string;
    };
    package_description?: string; // For delivery trips - package details
    special_instructions?: string;
}

interface BroadcastState {
    tripId: string;
    nearbyDrivers: string[]; // user_id array
    currentIndex: number;
    broadcastStartTime: Date;
    timer: NodeJS.Timeout | null;
    vehicleTypeTimer?: NodeJS.Timeout | null; // Timer for vehicle type matching phase (1 minute)
    vehicleTypePollInterval?: NodeJS.Timeout | null; // Interval to poll for matching vehicle type drivers
    autoCancelTimer?: NodeJS.Timeout | null; // Timer for auto-cancel after expansion (2 minutes, total 3 minutes)
    hasExpandedToAllTypes?: boolean; // Whether we've expanded to all vehicle types
    isPollingForVehicleType?: boolean; // Whether we're currently polling for matching vehicle type
}

@Injectable()
export class TripsService {
    private readonly logger = new Logger(TripsService.name);
    private autoCancelTimers: Map<string, NodeJS.Timeout> = new Map();
    private tripBroadcasts: Map<string, BroadcastState> = new Map();

    constructor(
        private readonly postgresService: PostgresService,
        private readonly driverProfilesRepository: DriverProfilesPostgresRepository,
        private readonly vehiclesRepository: VehiclesPostgresRepository,
        private readonly tripStatusSyncService: TripStatusSyncService,
        @Inject(forwardRef(() => SocketGateway)) private readonly socketGateway: SocketGateway,
        @Inject(forwardRef(() => NotificationsService)) private readonly notificationsService: NotificationsService,
    ) { }

    /**
     * Creates a driver-initiated trip (from Flutter driver app)
     * 
     * Flow:
     * - Driver creates trip directly from app
     * - Trip status: 'in_progress' (immediately active)
     * - Driver is already assigned (driver_id set)
     * - NO broadcast to other drivers (driver's own trip)
     * - Returns trip immediately for driver to proceed
     * 
     * This is different from createDispatcherTrip which broadcasts to all drivers.
     */
    async createTrip(driverUserId: string, createTripDto: any) {
        const client = await this.postgresService.getClient();

        try {
            this.logger.log(`🚗 Creating driver-initiated trip for driver: ${driverUserId}`);
            this.logger.log(`Trip data: ${JSON.stringify(createTripDto, null, 2)}`);

            await client.query('BEGIN');

            // Get driver profile
            this.logger.log('Looking up driver profile...');
            const driverProfile = await this.driverProfilesRepository.findByUserId(driverUserId);
            if (!driverProfile) {
                this.logger.error(`Driver profile not found for user: ${driverUserId}`);
                throw new HttpException('Driver profile not found', HttpStatus.NOT_FOUND);
            }
            this.logger.log(`Found driver profile: ${driverProfile.id}`);

            // Get driver's active vehicle
            this.logger.log('Looking up driver vehicles...');
            const vehicles = await this.vehiclesRepository.findMany({ driver_id: driverProfile.id });
            this.logger.log(`Found ${vehicles.length} vehicles for driver`);

            const activeVehicle = vehicles.find(v => v.is_active) || vehicles[0];

            if (!activeVehicle) {
                this.logger.error(`No active vehicle found for driver: ${driverProfile.id}`);
                throw new HttpException('No active vehicle found for driver', HttpStatus.BAD_REQUEST);
            }
            this.logger.log(`Using vehicle: ${activeVehicle.id} (type: ${activeVehicle.vehicle_type_id})`);

            // Validate required trip data
            if (!createTripDto.pickup_address || !createTripDto.dropoff_address) {
                throw new HttpException('Pickup and dropoff addresses are required', HttpStatus.BAD_REQUEST);
            }

            if (!createTripDto.pickup_latitude || !createTripDto.pickup_longitude ||
                !createTripDto.dropoff_latitude || !createTripDto.dropoff_longitude) {
                throw new HttpException('Pickup and dropoff coordinates are required', HttpStatus.BAD_REQUEST);
            }

            // Handle passenger - create user if new passenger
            let passengerId = createTripDto.passenger_id;

            // If no passenger_id provided, try to get from phone number
            if (!passengerId && createTripDto.passenger_phone) {
                // Check if passenger exists by phone
                const existingUserQuery = 'SELECT id FROM users WHERE phone_number = $1';
                const existingUserResult = await client.query(existingUserQuery, [createTripDto.passenger_phone]);

                if (existingUserResult.rows.length > 0) {
                    passengerId = existingUserResult.rows[0].id;
                } else {
                    // Create new passenger user
                    const createUserQuery = `
            INSERT INTO users (phone_number, full_name, user_type, is_phone_verified, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            RETURNING id
          `;
                    const newUserResult = await client.query(createUserQuery, [
                        createTripDto.passenger_phone,
                        createTripDto.trip_details?.passenger_name || 'Passenger',
                        'passenger',
                        true,
                        true
                    ]);
                    passengerId = newUserResult.rows[0].id;
                    this.logger.log(`Created new passenger user: ${passengerId}`);
                }
            }

            // If still no passenger ID, create an anonymous passenger for driver-initiated trips
            if (!passengerId) {
                this.logger.log('No passenger information provided, creating anonymous passenger for driver-initiated trip');
                const createAnonymousUserQuery = `
            INSERT INTO users (phone_number, full_name, user_type, is_phone_verified, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            RETURNING id
          `;
                const anonymousUserResult = await client.query(createAnonymousUserQuery, [
                    'anonymous-' + Date.now(), // Generate a unique identifier
                    createTripDto.trip_details?.passenger_name || 'Anonymous Passenger',
                    'passenger',
                    false, // Not phone verified for anonymous users
                    true
                ]);
                passengerId = anonymousUserResult.rows[0].id;
                this.logger.log(`Created anonymous passenger user: ${passengerId}`);
            }

            // Check if passenger has a profile to determine if they're new
            let passengerProfileId = null;
            if (passengerId) {
                const passengerProfileQuery = 'SELECT id FROM passenger_profiles WHERE user_id = $1';
                const passengerProfileResult = await client.query(passengerProfileQuery, [passengerId]);
                if (passengerProfileResult.rows.length > 0) {
                    passengerProfileId = passengerProfileResult.rows[0].id;
                }
            }

            // Generate trip reference
            const tripReference = `TRP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

            // Calculate estimated duration if not provided
            const estimatedDurationMinutes = createTripDto.estimated_duration_minutes ||
                this.calculateEstimatedDuration(createTripDto.estimated_distance_km || 0);

            // Create trip record
            const tripQuery = `
        INSERT INTO trips (
          passenger_id,
          passenger_profile_id,
          driver_id,
          vehicle_id,
          vehicle_type_id,
          status,
          pickup_address,
          pickup_latitude,
          pickup_longitude,
          pickup_point,
          dropoff_address,
          dropoff_latitude,
          dropoff_longitude,
          dropoff_point,
          estimated_distance_km,
          estimated_duration_minutes,
          estimated_fare_cents,
          trip_type,
          passenger_count,
          payment_method,
          payment_status,
          request_timestamp,
          trip_reference,
          started_at,
          trip_started_at,
          is_new_passenger
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, ST_Point($10, $11)::point,
          $12, $13, $14, ST_Point($15, $16)::point, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW(), NOW(), $26
        ) RETURNING *
      `;

            // Determine if passenger is new (no passenger profile exists)
            const isNewPassenger = !passengerProfileId;
            this.logger.log(`👤 Passenger profile ID: ${passengerProfileId}, is_new_passenger: ${isNewPassenger}`);

            const tripValues = [
                passengerId, // Now guaranteed to have a valid passenger ID
                passengerProfileId, // Passenger profile ID (null if new user)
                driverProfile.id,
                activeVehicle.id,
                activeVehicle.vehicle_type_id, // Use the correct field name
                'in_progress', // Driver-initiated trips start as in_progress
                createTripDto.pickup_address,
                createTripDto.pickup_latitude,
                createTripDto.pickup_longitude,
                createTripDto.pickup_longitude, // For ST_Point
                createTripDto.pickup_latitude,  // For ST_Point
                createTripDto.dropoff_address,
                createTripDto.dropoff_latitude,
                createTripDto.dropoff_longitude,
                createTripDto.dropoff_longitude, // For ST_Point
                createTripDto.dropoff_latitude,  // For ST_Point
                createTripDto.estimated_distance_km,
                estimatedDurationMinutes,
                Math.round((createTripDto.estimated_fare || 0) * 100), // Convert to cents
                createTripDto.trip_type || 'standard',
                createTripDto.passenger_count || 1,
                createTripDto.payment_method || 'cash',
                'pending',
                new Date(),
                tripReference,
                isNewPassenger
            ];

            this.logger.log('Creating trip record...');
            this.logger.log(`Trip values: ${JSON.stringify(tripValues, null, 2)}`);

            const tripResult = await client.query(tripQuery, tripValues);
            const trip = tripResult.rows[0];
            this.logger.log(`Trip created successfully: ${trip.id}`);

            // Sync trip status with driver profile using the current transaction
            await this.tripStatusSyncService.syncTripStatus(trip.id, 'in_progress', driverProfile.id, client);

            // Create driver pickup record
            this.logger.log('Creating driver pickup record...');
            const pickupQuery = `
        INSERT INTO driver_pickups (
          driver_id,
          phone_number,
          pickup_address,
          pickup_latitude,
          pickup_longitude,
          pickup_point,
          dropoff_address,
          dropoff_latitude,
          dropoff_longitude,
          dropoff_point,
          estimated_fare_cents,
          status,
          notes
        ) VALUES (
          $1, $2, $3, $4, $5, ST_Point($6, $7)::point, $8, $9, $10, ST_Point($11, $12)::point, $13, $14, $15
        ) RETURNING *
      `;

            const pickupValues = [
                driverProfile.id,
                createTripDto.passenger_phone,
                createTripDto.pickup_address,
                createTripDto.pickup_latitude,
                createTripDto.pickup_longitude,
                createTripDto.pickup_longitude, // For ST_Point
                createTripDto.pickup_latitude,  // For ST_Point
                createTripDto.dropoff_address,
                createTripDto.dropoff_latitude,
                createTripDto.dropoff_longitude,
                createTripDto.dropoff_longitude, // For ST_Point
                createTripDto.dropoff_latitude,  // For ST_Point
                Math.round((createTripDto.estimated_fare || 0) * 100), // Convert to cents
                'created', // Driver-initiated pickups start as created
                createTripDto.notes || null
            ];

            this.logger.log(`Pickup values: ${JSON.stringify(pickupValues, null, 2)}`);
            const pickupResult = await client.query(pickupQuery, pickupValues);
            const driverPickup = pickupResult.rows[0];
            this.logger.log(`Driver pickup created: ${driverPickup.id}`);

            await client.query('COMMIT');

            this.logger.log(`Trip created successfully: ${trip.id}`);
            this.logger.log(`Driver pickup created: ${driverPickup.id}`);

            return {
                ...trip,
                driver_pickup: driverPickup
            };

        } catch (error) {
            await client.query('ROLLBACK');
            this.logger.error('Error creating trip:', error);
            this.logger.error('Error details:', {
                message: error.message,
                code: error.code,
                detail: error.detail,
                hint: error.hint,
                position: error.position,
                stack: error.stack
            });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Creates a customer support/dispatcher-initiated trip (from website dashboard)
     * 
     * Flow:
     * - Customer support creates trip from dashboard
     * - Trip status: 'requested' (needs driver to accept)
     * - NO driver assigned initially (driver_id is null)
     * - Broadcasts to ALL available drivers via 'trip_support_broadcast' event
     * - Flutter app shows modal for drivers to accept/decline
     * - First driver to accept gets assigned
     * 
     * This is different from createTrip which is driver's own trip and doesn't broadcast.
     */
    async createDispatcherTrip(dispatcherUserId: string, tripDto: DispatcherTripDto) {
        const client = await this.postgresService.getClient();

        try {
            await client.query('BEGIN');

            if (!tripDto.pickup_address || !tripDto.dropoff_address) {
                throw new HttpException('Pickup and dropoff addresses are required', HttpStatus.BAD_REQUEST);
            }

            if (
                !tripDto.pickup_latitude ||
                !tripDto.pickup_longitude ||
                !tripDto.dropoff_latitude ||
                !tripDto.dropoff_longitude
            ) {
                throw new HttpException('Pickup and dropoff coordinates are required', HttpStatus.BAD_REQUEST);
            }

            let passengerId = null;

            if (tripDto.passenger_phone) {
                const existingUserQuery = 'SELECT id FROM users WHERE phone_number = $1';
                const existingUserResult = await client.query(existingUserQuery, [tripDto.passenger_phone]);

                if (existingUserResult.rows.length > 0) {
                    passengerId = existingUserResult.rows[0].id;
                } else {
                    const createUserQuery = `
                        INSERT INTO users (phone_number, full_name, user_type, is_phone_verified, is_active, created_at, updated_at)
                        VALUES ($1, $2, 'passenger', true, true, NOW(), NOW())
                        RETURNING id
                    `;
                    const newUserResult = await client.query(createUserQuery, [
                        tripDto.passenger_phone,
                        tripDto.passenger_name || tripDto.trip_details?.passenger_name || 'Passenger'
                    ]);
                    passengerId = newUserResult.rows[0].id;
                }
            }

            if (!passengerId) {
                const anonymousUserQuery = `
                    INSERT INTO users (phone_number, full_name, user_type, is_phone_verified, is_active, created_at, updated_at)
                    VALUES ($1, $2, 'passenger', false, true, NOW(), NOW())
                    RETURNING id
                `;
                const anonymousUserResult = await client.query(anonymousUserQuery, [
                    `dispatcher-${Date.now()}`,
                    tripDto.passenger_name || tripDto.trip_details?.passenger_name || 'Walk-in Passenger'
                ]);
                passengerId = anonymousUserResult.rows[0].id;
            }

            const passengerProfileQuery = 'SELECT id FROM passenger_profiles WHERE user_id = $1';
            const passengerProfileResult = await client.query(passengerProfileQuery, [passengerId]);
            const passengerProfileId = passengerProfileResult.rows.length ? passengerProfileResult.rows[0].id : null;

            const tripReference = `TRP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
            // Ensure integer minutes for integer column in DB
            const estimatedDurationMinutesRaw =
                tripDto.estimated_duration_minutes ??
                this.calculateEstimatedDuration(tripDto.estimated_distance_km || 0);
            const estimatedDurationMinutes = Math.ceil(Number(estimatedDurationMinutesRaw || 0));

            // For delivery trips, use recipient_name; for standard trips, use passenger_name
            const isDelivery = tripDto.trip_type === 'delivery';
            const displayName = isDelivery
                ? (tripDto.recipient_name || tripDto.passenger_name || tripDto.trip_details?.passenger_name || 'Recipient')
                : (tripDto.passenger_name || tripDto.trip_details?.passenger_name || 'Walk-in Passenger');

            // For delivery trips, store package_description; for standard trips, use special_instructions
            const instructions = isDelivery
                ? (tripDto.package_description || tripDto.special_instructions || tripDto.trip_details?.special_instructions || null)
                : (tripDto.special_instructions || tripDto.trip_details?.special_instructions || null);

            const tripQuery = `
                INSERT INTO trips (
                    passenger_id,
                    passenger_profile_id,
                    status,
                    pickup_address,
                    pickup_latitude,
                    pickup_longitude,
                    pickup_point,
                    dropoff_address,
                    dropoff_latitude,
                    dropoff_longitude,
                    dropoff_point,
                    estimated_distance_km,
                    estimated_duration_minutes,
                    estimated_fare_cents,
                    trip_type,
                    passenger_count,
                    payment_method,
                    payment_status,
                    request_timestamp,
                    trip_reference,
                    is_new_passenger,
                    dispatcher_user_id,
                    special_instructions,
                    recipient_name,
                    package_description
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, ST_Point($7, $8)::point,
                    $9, $10, $11, ST_Point($12, $13)::point, $14, $15, $16,
                    $17, $18, $19, $20, NOW(), $21, $22, $23, $24, $25, $26
                ) RETURNING *
            `;

            const tripValues = [
                passengerId,
                passengerProfileId,
                'requested',
                tripDto.pickup_address,
                tripDto.pickup_latitude,
                tripDto.pickup_longitude,
                tripDto.pickup_longitude,
                tripDto.pickup_latitude,
                tripDto.dropoff_address,
                tripDto.dropoff_latitude,
                tripDto.dropoff_longitude,
                tripDto.dropoff_longitude,
                tripDto.dropoff_latitude,
                tripDto.estimated_distance_km || null,
                estimatedDurationMinutes,
                Math.round((tripDto.estimated_fare || 0) * 100),
                tripDto.trip_type || 'standard',
                1,
                'cash',
                'pending',
                tripReference,
                passengerProfileId ? false : true,
                dispatcherUserId,
                instructions,
                isDelivery ? displayName : null, // recipient_name only for delivery trips
                isDelivery ? tripDto.package_description || null : null, // package_description only for delivery trips
            ];

            const tripResult = await client.query(tripQuery, tripValues);
            const trip = tripResult.rows[0];

            await client.query('COMMIT');

            this.logger.log(`📞 Dispatcher trip created: ${trip.id}`);

            // Broadcast to all available drivers (ONLY for dispatcher trips, NOT driver-initiated)
            // Driver-initiated trips (createTrip) do NOT broadcast - they're already assigned
            // Note: Auto-cancel is now handled in notifyAvailableDrivers (3 minutes total)
            await this.notifyAvailableDrivers(trip);

            return trip;
        } catch (error) {
            await client.query('ROLLBACK');
            this.logger.error('Error creating dispatcher trip:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Find nearby drivers using PostGIS spatial query
     * @param pickupLat Pickup latitude
     * @param pickupLng Pickup longitude  
     * @param radiusKm Search radius in kilometers (default 10km)
     * @param vehicleTypeId Optional vehicle type ID to filter drivers by vehicle type
     * @returns Array of driver user IDs sorted by distance
     */
    private async findNearbyDrivers(pickupLat: number, pickupLng: number, radiusKm: number = 10, vehicleTypeId?: number): Promise<string[]> {
        try {
            // Extract coordinates from PostgreSQL POINT type and convert to PostGIS geography
            // PostgreSQL POINT type stores (lng, lat) as (x, y)
            // Use array indexing [0] for x (longitude) and [1] for y (latitude)

            let query: string;
            let params: any[];

            if (vehicleTypeId) {
                // Filter by vehicle type - join with vehicles table
                query = `
                    SELECT DISTINCT dp.user_id
                    FROM driver_profiles dp
                    INNER JOIN vehicles v ON v.driver_id = dp.id
                    WHERE dp.is_online = true 
                      AND dp.is_available = true
                      AND dp.last_known_location IS NOT NULL
                      AND dp.last_location_update > NOW() - INTERVAL '5 minutes'
                      AND v.vehicle_type_id = $4
                      AND v.is_active = true
                      AND ST_DWithin(
                          ST_SetSRID(ST_MakePoint((dp.last_known_location)[0], (dp.last_known_location)[1]), 4326)::geography,
                          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                          $3 * 1000
                      )
                    ORDER BY ST_Distance(
                        ST_SetSRID(ST_MakePoint((dp.last_known_location)[0], (dp.last_known_location)[1]), 4326)::geography,
                        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
                    )
                    LIMIT 20
                `;
                params = [pickupLng, pickupLat, radiusKm, vehicleTypeId];
            } else {
                // No vehicle type filter - get all nearby drivers
                query = `
                    SELECT dp.user_id
                    FROM driver_profiles dp
                    WHERE dp.is_online = true 
                      AND dp.is_available = true
                      AND dp.last_known_location IS NOT NULL
                      AND dp.last_location_update > NOW() - INTERVAL '5 minutes'
                      AND ST_DWithin(
                          ST_SetSRID(ST_MakePoint((dp.last_known_location)[0], (dp.last_known_location)[1]), 4326)::geography,
                          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                          $3 * 1000
                      )
                    ORDER BY ST_Distance(
                        ST_SetSRID(ST_MakePoint((dp.last_known_location)[0], (dp.last_known_location)[1]), 4326)::geography,
                        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
                    )
                    LIMIT 20
                `;
                params = [pickupLng, pickupLat, radiusKm];
            }

            const result = await this.postgresService.query(query, params);
            const driverUserIds = result.rows.map(row => row.user_id);

            const vehicleTypeInfo = vehicleTypeId ? ` with vehicle_type_id=${vehicleTypeId}` : '';
            this.logger.log(`Found ${driverUserIds.length} nearby drivers${vehicleTypeInfo} within ${radiusKm}km of (${pickupLat}, ${pickupLng})`);

            return driverUserIds;
        } catch (error) {
            this.logger.error('Error finding nearby drivers:', error);
            return [];
        }
    }

    /**
     * Broadcasts trip request to nearby drivers sequentially
     * 
     * ONLY called for dispatcher/customer support trips (createDispatcherTrip)
     * NOT called for driver-initiated trips (createTrip) - they're already assigned
     * 
     * Event: 'trip_support_broadcast' - matches Flutter app listener
     * 
     * Strategy:
     * 1. First, broadcast to drivers with matching vehicle_type_id (if specified)
     * 2. After 1 minute, if no acceptance, expand to all vehicle types within 5km
     */
    private async notifyAvailableDrivers(trip: any) {
        try {
            // Only broadcast if trip has no driver assigned (dispatcher trip)
            // Driver-initiated trips already have driver_id and should not broadcast
            if (trip.driver_id) {
                this.logger.warn(`Skipping broadcast for trip ${trip.id} - already has driver assigned (driver-initiated trip)`);
                return;
            }

            const vehicleTypeId = trip.vehicle_type_id ? Number(trip.vehicle_type_id) : undefined;

            // Step 1: First try to find drivers with matching vehicle type (if specified)
            let nearbyDrivers: string[] = [];
            let shouldPollForVehicleType = false;

            if (vehicleTypeId) {
                this.logger.log(`🔍 Step 1: Finding drivers with vehicle_type_id=${vehicleTypeId} for trip ${trip.id}`);
                nearbyDrivers = await this.findNearbyDrivers(
                    trip.pickup_latitude,
                    trip.pickup_longitude,
                    2, // 2km radius for vehicle type matching
                    vehicleTypeId
                );

                if (nearbyDrivers.length === 0) {
                    // No matching vehicle type drivers found - we'll poll for 1 minute before expanding
                    this.logger.log(`⚠️ No drivers found with matching vehicle_type_id=${vehicleTypeId} - will poll for 1 minute before expanding to all vehicle types`);
                    shouldPollForVehicleType = true;
                }
            } else {
                // No vehicle type specified - search all vehicle types immediately
                this.logger.log(`🔍 No vehicle type specified - searching all vehicle types for trip ${trip.id}`);
                nearbyDrivers = await this.findNearbyDrivers(
                    trip.pickup_latitude,
                    trip.pickup_longitude,
                    2, // 2km radius
                    undefined // No vehicle type filter
                );
            }

            // If no drivers found at all (even after searching all types), set up auto-cancel only
            if (nearbyDrivers.length === 0 && !shouldPollForVehicleType) {
                this.logger.warn(`No nearby drivers found for trip ${trip.id} - trip will be auto-canceled after 3 minutes if no driver accepts`);
                // Set up auto-cancel timer for 3 minutes
                const broadcastState: BroadcastState = {
                    tripId: trip.id,
                    nearbyDrivers: [],
                    currentIndex: 0,
                    broadcastStartTime: new Date(),
                    timer: null,
                    vehicleTypeTimer: null,
                    vehicleTypePollInterval: null,
                    autoCancelTimer: null,
                    hasExpandedToAllTypes: true,
                    isPollingForVehicleType: false,
                };
                this.tripBroadcasts.set(trip.id, broadcastState);

                broadcastState.autoCancelTimer = setTimeout(async () => {
                    const checkQuery = 'SELECT driver_id, status, dispatcher_user_id, trip_reference FROM trips WHERE id = $1';
                    const checkResult = await this.postgresService.query(checkQuery, [trip.id]);
                    if (checkResult.rows.length > 0) {
                        const tripData = checkResult.rows[0];
                        if (!tripData.driver_id && tripData.status === 'requested') {
                            const cancelQuery = `
                                UPDATE trips
                                SET status = 'canceled',
                                    canceled_at = NOW(),
                                    cancel_reason = 'no drivers in the selected place please wait and try again',
                                    updated_at = NOW()
                                WHERE id = $1 AND status = 'requested' AND driver_id IS NULL
                                RETURNING *
                            `;
                            const cancelResult = await this.postgresService.query(cancelQuery, [trip.id]);
                            if (cancelResult.rows.length > 0) {
                                this.logger.log(`✅ Auto-canceled trip ${trip.id} after 3 minutes (no drivers found)`);
                                if (tripData.dispatcher_user_id) {
                                    await this.notificationsService.create({
                                        user_id: tripData.dispatcher_user_id,
                                        title: 'Trip canceled (no drivers)',
                                        body: `Trip ${tripData.trip_reference || trip.id} was automatically canceled: no drivers in the selected place please wait and try again.`,
                                        type: 'trip',
                                        notification_type: 'trip_update',
                                        notification_category: 'trip',
                                        reference_id: trip.id,
                                        reference_type: 'trip',
                                        priority: 'normal',
                                        metadata: {
                                            trip_id: trip.id,
                                            event_type: 'auto_canceled',
                                            cancel_reason: 'no drivers in the selected place please wait and try again',
                                        },
                                    });
                                }
                                this.socketGateway.broadcastTripStatusChange(trip.id, '', 'canceled');
                            }
                        }
                    }
                    this.tripBroadcasts.delete(trip.id);
                }, 3 * 60 * 1000); // 3 minutes
                return;
            }

            // Initialize broadcast state
            // hasExpandedToAllTypes is true only if no vehicle type was specified (already searching all types)
            const broadcastState: BroadcastState = {
                tripId: trip.id,
                nearbyDrivers,
                currentIndex: 0,
                broadcastStartTime: new Date(),
                timer: null,
                vehicleTypeTimer: null,
                vehicleTypePollInterval: null,
                autoCancelTimer: null,
                hasExpandedToAllTypes: !vehicleTypeId, // Only expanded if no vehicle type was specified
                isPollingForVehicleType: shouldPollForVehicleType, // Will poll if no matching vehicle type found
            };

            this.tripBroadcasts.set(trip.id, broadcastState);

            // Set up auto-cancel timer for 3 minutes total
            // If vehicle type was specified, we'll expand after 1 minute, so auto-cancel is 3 minutes total
            // If no vehicle type was specified, we're already searching all types, so auto-cancel is 3 minutes from now
            const autoCancelDelay = 3 * 60 * 1000; // Always 3 minutes total
            broadcastState.autoCancelTimer = setTimeout(async () => {
                // Check if trip was already accepted
                const currentState = this.tripBroadcasts.get(trip.id);
                if (!currentState) {
                    this.logger.log(`Trip ${trip.id} was already accepted or canceled, skipping auto-cancel`);
                    return;
                }

                // Check if trip has a driver assigned
                const checkQuery = 'SELECT driver_id, status FROM trips WHERE id = $1';
                const checkResult = await this.postgresService.query(checkQuery, [trip.id]);
                if (checkResult.rows.length > 0 && checkResult.rows[0].driver_id) {
                    this.logger.log(`Trip ${trip.id} was already accepted, skipping auto-cancel`);
                    this.tripBroadcasts.delete(trip.id);
                    return;
                }

                if (checkResult.rows.length > 0 && checkResult.rows[0].status !== 'requested') {
                    this.logger.log(`Trip ${trip.id} status is ${checkResult.rows[0].status}, skipping auto-cancel`);
                    this.tripBroadcasts.delete(trip.id);
                    return;
                }

                this.logger.log(`⏱️ 3 minutes elapsed - auto-canceling trip ${trip.id} (no drivers in selected place)`);

                // Auto-cancel the trip
                const cancelQuery = `
                    UPDATE trips
                    SET status = 'canceled',
                        canceled_at = NOW(),
                        cancel_reason = 'no drivers in the selected place please wait and try again',
                        updated_at = NOW()
                    WHERE id = $1 AND status = 'requested' AND driver_id IS NULL
                    RETURNING *
                `;

                const cancelResult = await this.postgresService.query(cancelQuery, [trip.id]);

                if (cancelResult.rows.length > 0) {
                    const canceledTrip = cancelResult.rows[0];
                    this.logger.log(`✅ Auto-canceled trip ${trip.id} after 3 minutes`);

                    // Clean up broadcast state
                    if (currentState.timer) {
                        clearTimeout(currentState.timer);
                    }
                    if (currentState.vehicleTypeTimer) {
                        clearTimeout(currentState.vehicleTypeTimer);
                    }
                    this.tripBroadcasts.delete(trip.id);

                    // Send notification to dispatcher if exists
                    if (canceledTrip.dispatcher_user_id) {
                        await this.notificationsService.create({
                            user_id: canceledTrip.dispatcher_user_id,
                            title: 'Trip canceled (no drivers)',
                            body: `Trip ${canceledTrip.trip_reference || trip.id} was automatically canceled: no drivers in the selected place please wait and try again.`,
                            type: 'trip',
                            notification_type: 'trip_update',
                            notification_category: 'trip',
                            reference_id: trip.id,
                            reference_type: 'trip',
                            priority: 'normal',
                            metadata: {
                                trip_id: trip.id,
                                event_type: 'auto_canceled',
                                cancel_reason: 'no drivers in the selected place please wait and try again',
                            },
                        });
                    }

                    // Broadcast status change (no driver assigned, so pass empty string)
                    this.socketGateway.broadcastTripStatusChange(trip.id, '', 'canceled');
                }
            }, autoCancelDelay);

            // If we have vehicle type filtering, set up polling or expansion timer
            if (vehicleTypeId && !broadcastState.hasExpandedToAllTypes) {
                if (shouldPollForVehicleType) {
                    // No matching vehicle type drivers found - poll for 1 minute
                    this.logger.log(`⏱️ Starting 1-minute polling for matching vehicle_type_id=${vehicleTypeId} drivers for trip ${trip.id}`);
                    broadcastState.isPollingForVehicleType = true;

                    // Poll every 5 seconds for matching vehicle type drivers
                    let pollCount = 0;
                    const maxPolls = 12; // 12 polls * 5 seconds = 60 seconds (1 minute)

                    broadcastState.vehicleTypePollInterval = setInterval(async () => {
                        pollCount++;

                        // Check if trip was already accepted
                        const currentState = this.tripBroadcasts.get(trip.id);
                        if (!currentState) {
                            this.logger.log(`Trip ${trip.id} was already accepted or canceled, stopping polling`);
                            if (broadcastState.vehicleTypePollInterval) {
                                clearInterval(broadcastState.vehicleTypePollInterval);
                            }
                            return;
                        }

                        // Check if trip has a driver assigned
                        const checkQuery = 'SELECT driver_id FROM trips WHERE id = $1';
                        const checkResult = await this.postgresService.query(checkQuery, [trip.id]);
                        if (checkResult.rows.length > 0 && checkResult.rows[0].driver_id) {
                            this.logger.log(`Trip ${trip.id} was already accepted, stopping polling`);
                            if (broadcastState.vehicleTypePollInterval) {
                                clearInterval(broadcastState.vehicleTypePollInterval);
                            }
                            this.tripBroadcasts.delete(trip.id);
                            return;
                        }

                        // Search for matching vehicle type drivers
                        this.logger.log(`🔍 Polling attempt ${pollCount}/${maxPolls}: Searching for vehicle_type_id=${vehicleTypeId} drivers within 2km`);
                        const matchingDrivers = await this.findNearbyDrivers(
                            trip.pickup_latitude,
                            trip.pickup_longitude,
                            2, // 2km radius
                            vehicleTypeId
                        );

                        if (matchingDrivers.length > 0) {
                            this.logger.log(`✅ Found ${matchingDrivers.length} matching vehicle type drivers during polling - starting broadcast`);

                            // Stop polling
                            if (broadcastState.vehicleTypePollInterval) {
                                clearInterval(broadcastState.vehicleTypePollInterval);
                                broadcastState.vehicleTypePollInterval = null;
                            }
                            broadcastState.isPollingForVehicleType = false;

                            // Add matching drivers to broadcast list
                            currentState.nearbyDrivers = matchingDrivers;
                            currentState.currentIndex = 0;

                            // Start broadcasting to first driver
                            await this.broadcastToNextDriver(trip, currentState);
                        } else if (pollCount >= maxPolls) {
                            // 1 minute elapsed - expand to all vehicle types
                            this.logger.log(`⏱️ 1 minute elapsed - no matching vehicle type drivers found, expanding to all vehicle types within 2km`);

                            // Stop polling
                            if (broadcastState.vehicleTypePollInterval) {
                                clearInterval(broadcastState.vehicleTypePollInterval);
                                broadcastState.vehicleTypePollInterval = null;
                            }
                            broadcastState.isPollingForVehicleType = false;

                            // Find all drivers within 2km (any vehicle type)
                            const allTypeDrivers = await this.findNearbyDrivers(
                                trip.pickup_latitude,
                                trip.pickup_longitude,
                                2, // 2km radius
                                undefined // No vehicle type filter
                            );

                            if (allTypeDrivers.length > 0) {
                                this.logger.log(`➕ Found ${allTypeDrivers.length} drivers (all vehicle types) - adding to broadcast list`);
                                currentState.nearbyDrivers = allTypeDrivers;
                                currentState.hasExpandedToAllTypes = true;
                                currentState.currentIndex = 0;

                                // Start broadcasting to first driver
                                await this.broadcastToNextDriver(trip, currentState);
                            } else {
                                this.logger.log(`No drivers found within 2km when expanding to all vehicle types`);
                            }
                        }
                    }, 5 * 1000); // Poll every 5 seconds
                } else {
                    // Matching vehicle type drivers found - set up 1-minute timer to expand if not accepted
                    this.logger.log(`⏱️ Setting 1-minute timer to expand to all vehicle types if no acceptance for trip ${trip.id}`);
                    broadcastState.vehicleTypeTimer = setTimeout(async () => {
                        // Check if trip was already accepted
                        const currentState = this.tripBroadcasts.get(trip.id);
                        if (!currentState) {
                            this.logger.log(`Trip ${trip.id} was already accepted or canceled, skipping expansion`);
                            return;
                        }

                        // Check if trip has a driver assigned
                        const checkQuery = 'SELECT driver_id FROM trips WHERE id = $1';
                        const checkResult = await this.postgresService.query(checkQuery, [trip.id]);
                        if (checkResult.rows.length > 0 && checkResult.rows[0].driver_id) {
                            this.logger.log(`Trip ${trip.id} was already accepted, skipping expansion`);
                            this.tripBroadcasts.delete(trip.id);
                            return;
                        }

                        this.logger.log(`⏱️ 1 minute elapsed - expanding trip ${trip.id} to all vehicle types within 2km`);

                        // Find all drivers within 2km (any vehicle type)
                        const allTypeDrivers = await this.findNearbyDrivers(
                            trip.pickup_latitude,
                            trip.pickup_longitude,
                            2, // 2km radius
                            undefined // No vehicle type filter
                        );

                        if (allTypeDrivers.length > 0) {
                            // Merge with existing drivers, avoiding duplicates
                            const existingDriverIds = new Set(currentState.nearbyDrivers);
                            const newDrivers = allTypeDrivers.filter(id => !existingDriverIds.has(id));

                            if (newDrivers.length > 0) {
                                this.logger.log(`➕ Adding ${newDrivers.length} additional drivers (all vehicle types) to broadcast list`);
                                currentState.nearbyDrivers = [...currentState.nearbyDrivers, ...newDrivers];
                                currentState.hasExpandedToAllTypes = true;

                                // If we've exhausted the current list, start broadcasting to new drivers
                                if (currentState.currentIndex >= currentState.nearbyDrivers.length - newDrivers.length) {
                                    await this.broadcastToNextDriver(trip, currentState);
                                }
                            } else {
                                this.logger.log(`No additional drivers found when expanding to all vehicle types`);
                            }
                        } else {
                            this.logger.log(`No drivers found within 2km when expanding to all vehicle types`);
                        }
                    }, 60 * 1000); // 1 minute
                }
            }

            // Start broadcasting to first driver (if we have drivers and not polling)
            if (nearbyDrivers.length > 0 && !shouldPollForVehicleType) {
                await this.broadcastToNextDriver(trip, broadcastState);
            }

        } catch (error) {
            this.logger.error('Failed to start sequential broadcast:', error);
        }
    }

    /**
     * Broadcast to the next driver in the sequence
     */
    private async broadcastToNextDriver(trip: any, broadcastState: BroadcastState) {
        try {
            // Check if we've exhausted all drivers or exceeded 10 minutes
            const elapsed = Date.now() - broadcastState.broadcastStartTime.getTime();
            if (broadcastState.currentIndex >= broadcastState.nearbyDrivers.length || elapsed > 10 * 60 * 1000) {
                this.logger.warn(`Trip ${trip.id} exhausted all drivers or exceeded time limit`);
                this.tripBroadcasts.delete(trip.id);
                return;
            }

            const driverUserId = broadcastState.nearbyDrivers[broadcastState.currentIndex];
            this.logger.log(`Broadcasting trip ${trip.id} to driver ${driverUserId} (${broadcastState.currentIndex + 1}/${broadcastState.nearbyDrivers.length})`);

            // Get connected drivers
            const connectedDrivers = this.socketGateway.getConnectedDrivers();
            const driverSocket = connectedDrivers.get(driverUserId);

            if (!driverSocket) {
                this.logger.warn(`Driver ${driverUserId} not connected, moving to next driver`);
                broadcastState.currentIndex++;
                await this.broadcastToNextDriver(trip, broadcastState);
                return;
            }

            // Get passenger phone number and name from users table
            let passengerPhone = trip.passenger_phone;
            let passengerName = trip.passenger_name;
            if (trip.passenger_id && (!passengerPhone || !passengerName)) {
                const client = await this.postgresService.getClient();
                try {
                    const userQuery = 'SELECT phone_number, full_name FROM users WHERE id = $1';
                    const userResult = await client.query(userQuery, [trip.passenger_id]);
                    if (userResult.rows.length > 0) {
                        passengerPhone = passengerPhone || userResult.rows[0].phone_number;
                        passengerName = passengerName || userResult.rows[0].full_name || 'Walk-in Passenger';
                    }
                } catch (error) {
                    this.logger.warn(`Could not fetch passenger info for trip ${trip.id}: ${error}`);
                } finally {
                    client.release();
                }
            }

            // For delivery trips, use recipient_name; for standard trips, use passenger_name
            const isDelivery = trip.trip_type === 'delivery';
            const displayName = isDelivery
                ? (trip.recipient_name || passengerName || 'Recipient')
                : (passengerName || 'Walk-in Passenger');

            // Convert fare from cents to ETB for Flutter app
            const fareEstimate = trip.estimated_fare_cents ? trip.estimated_fare_cents / 100 : null;

            // Format payload to match SupportTripRequest model in Flutter app
            const payload: any = {
                tripId: trip.id,
                trip_id: trip.id, // Support both formats
                passengerPhone: passengerPhone || '',
                passenger_phone: passengerPhone || '', // Support both formats
                passengerName: displayName, // Use recipient_name for delivery, passenger_name for standard
                passenger_name: displayName, // Support both formats
                pickup: {
                    address: trip.pickup_address,
                    lat: trip.pickup_latitude,
                    lng: trip.pickup_longitude,
                    latitude: trip.pickup_latitude, // Support both formats
                    longitude: trip.pickup_longitude, // Support both formats
                },
                dropoff: {
                    address: trip.dropoff_address,
                    lat: trip.dropoff_latitude,
                    lng: trip.dropoff_longitude,
                    latitude: trip.dropoff_latitude, // Support both formats
                    longitude: trip.dropoff_longitude, // Support both formats
                },
                fareEstimate: fareEstimate,
                fare_estimate: fareEstimate, // Support both formats
                estimated_fare_cents: trip.estimated_fare_cents, // Keep for backward compatibility
                estimated_distance_km: trip.estimated_distance_km,
                estimated_duration_minutes: trip.estimated_duration_minutes,
                trip_type: trip.trip_type,
                trip_reference: trip.trip_reference,
                status: trip.status,
                created_at: trip.created_at,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes expiry
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // Support both formats
            };

            // Add delivery-specific fields
            if (isDelivery) {
                payload.recipient_name = trip.recipient_name || displayName;
                payload.package_description = trip.package_description || trip.special_instructions || null;
                payload.notes = trip.package_description || trip.special_instructions || null; // For backward compatibility
            } else {
                payload.notes = trip.special_instructions || null;
            }

            // Send to this specific driver only
            this.socketGateway.sendToDriver(driverUserId, 'trip_support_broadcast', payload);
            this.logger.log(`✅ Sent trip_support_broadcast to driver ${driverUserId} for trip ${trip.id}`);

            // Set timeout for 5 minutes - if no response, move to next driver
            broadcastState.timer = setTimeout(async () => {
                this.logger.warn(`Driver ${driverUserId} did not respond to trip ${trip.id} within 5 minutes, moving to next driver`);
                broadcastState.currentIndex++;
                await this.broadcastToNextDriver(trip, broadcastState);
            }, 5 * 60 * 1000); // 5 minutes

        } catch (error) {
            this.logger.error('Failed to broadcast to driver:', error);
            broadcastState.currentIndex++;
            await this.broadcastToNextDriver(trip, broadcastState);
        }
    }

    private scheduleAutoCancel(tripId: string, minutes: number) {
        if (this.autoCancelTimers.has(tripId)) {
            clearTimeout(this.autoCancelTimers.get(tripId)!);
        }

        this.logger.log(`Scheduling auto-cancel for trip ${tripId} after ${minutes} minutes`);

        const timeout = setTimeout(async () => {
            try {
                // Cancel trip if it's still in 'requested' or 'created' status (no driver assigned)
                const cancelQuery = `
                    UPDATE trips
                    SET status = 'canceled',
                        canceled_at = NOW(),
                        cancel_reason = 'Auto-canceled: no driver accepted within time limit',
                        updated_at = NOW()
                    WHERE id = $1 AND status IN ('requested', 'created') AND driver_id IS NULL
                    RETURNING *
                `;

                const result = await this.postgresService.query(cancelQuery, [tripId]);

                if (!result.rows.length) {
                    this.logger.log(`Trip ${tripId} was already assigned, canceled, or completed - skipping auto-cancel`);
                    return;
                }

                const trip = result.rows[0];
                this.logger.log(`Auto-canceling trip ${tripId} after ${minutes} minutes without driver assignment`);

                // Clean up broadcast state if exists
                if (this.tripBroadcasts.has(tripId)) {
                    const broadcastState = this.tripBroadcasts.get(tripId);
                    if (broadcastState?.timer) {
                        clearTimeout(broadcastState.timer);
                    }
                    if (broadcastState?.vehicleTypeTimer) {
                        clearTimeout(broadcastState.vehicleTypeTimer);
                    }
                    if (broadcastState?.vehicleTypePollInterval) {
                        clearInterval(broadcastState.vehicleTypePollInterval);
                    }
                    if (broadcastState?.autoCancelTimer) {
                        clearTimeout(broadcastState.autoCancelTimer);
                    }
                    this.tripBroadcasts.delete(tripId);
                }

                // Send notification to dispatcher if exists
                if (trip.dispatcher_user_id) {
                    await this.notificationsService.create({
                        user_id: trip.dispatcher_user_id,
                        title: 'Trip canceled (no driver)',
                        body: `Trip ${trip.trip_reference} was automatically canceled after ${minutes} minutes without driver assignment.`,
                        type: 'trip',
                        notification_type: 'trip_update',
                        notification_category: 'trip',
                        reference_id: tripId,
                        reference_type: 'trip',
                        priority: 'normal',
                        metadata: {
                            trip_id: tripId,
                            event_type: 'auto_canceled',
                        },
                    });
                }

                // Broadcast status change
                this.socketGateway.broadcastTripStatusChange(tripId, trip.driver_id, 'canceled');
            } catch (error) {
                this.logger.error(`Failed to auto-cancel trip ${tripId}:`, error);
            } finally {
                this.autoCancelTimers.delete(tripId);
            }
        }, minutes * 60 * 1000);

        this.autoCancelTimers.set(tripId, timeout);
    }

    /**
     * Accept a support trip and assign it to the driver
     */
    async acceptSupportTrip(tripId: string, driverUserId: string): Promise<{ success: boolean; trip?: any; error?: string }> {
        const client = await this.postgresService.getClient();

        try {
            await client.query('BEGIN');

            // Cancel auto-cancel timer if exists
            if (this.autoCancelTimers.has(tripId)) {
                clearTimeout(this.autoCancelTimers.get(tripId)!);
                this.autoCancelTimers.delete(tripId);
                this.logger.log(`Cancelled auto-cancel timer for trip ${tripId}`);
            }

            // Cancel broadcast timer if exists
            const broadcastState = this.tripBroadcasts.get(tripId);
            if (broadcastState) {
                if (broadcastState.timer) {
                    clearTimeout(broadcastState.timer);
                }
                if (broadcastState.vehicleTypeTimer) {
                    clearTimeout(broadcastState.vehicleTypeTimer);
                }
                if (broadcastState.vehicleTypePollInterval) {
                    clearInterval(broadcastState.vehicleTypePollInterval);
                }
                if (broadcastState.autoCancelTimer) {
                    clearTimeout(broadcastState.autoCancelTimer);
                }
                this.tripBroadcasts.delete(tripId);
                this.logger.log(`Cancelled broadcast state for trip ${tripId}`);
            }

            // Get the trip and verify it's still available
            const tripQuery = 'SELECT * FROM trips WHERE id = $1 FOR UPDATE';
            const tripResult = await client.query(tripQuery, [tripId]);

            if (tripResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Trip not found' };
            }

            const trip = tripResult.rows[0];

            // Check if trip is still in requested status and has no driver
            if (trip.status !== 'requested') {
                await client.query('ROLLBACK');
                return { success: false, error: 'Trip is no longer available' };
            }

            if (trip.driver_id) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Trip already assigned to another driver' };
            }

            // Resolve driver profile ID from user ID
            const driverProfileQuery = `
                SELECT id
                FROM driver_profiles
                WHERE user_id = $1
                FOR UPDATE
            `;
            const driverProfileResult = await client.query(driverProfileQuery, [driverUserId]);
            if (driverProfileResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return { success: false, error: 'Driver profile not found' };
            }
            const driverProfileId = driverProfileResult.rows[0].id;

            // Update trip with driver assignment (use driver profile ID)
            const updateTripQuery = `
                UPDATE trips
                SET driver_id = $1,
                    status = 'accepted',
                    accepted_at = NOW(),
                    updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `;
            const updateResult = await client.query(updateTripQuery, [driverProfileId, tripId]);
            const updatedTrip = updateResult.rows[0];

            // Update driver profile: set current trip and make unavailable
            const updateDriverProfileQuery = `
                UPDATE driver_profiles
                SET current_trip_id = $1,
                    is_available = false,
                    updated_at = NOW()
                WHERE id = $2
            `;
            await client.query(updateDriverProfileQuery, [tripId, driverProfileId]);

            await client.query('COMMIT');

            // Enrich trip data with passenger info
            let passengerPhone = updatedTrip.passenger_phone;
            let passengerName = updatedTrip.passenger_name;
            if (updatedTrip.passenger_id && (!passengerPhone || !passengerName)) {
                const enrichClient = await this.postgresService.getClient();
                try {
                    const userQuery = 'SELECT phone_number, full_name FROM users WHERE id = $1';
                    const userResult = await enrichClient.query(userQuery, [updatedTrip.passenger_id]);
                    if (userResult.rows.length > 0) {
                        passengerPhone = passengerPhone || userResult.rows[0].phone_number;
                        passengerName = passengerName || userResult.rows[0].full_name || 'Walk-in Passenger';
                    }
                } catch (error) {
                    this.logger.warn(`Could not fetch passenger info for trip ${tripId}: ${error}`);
                } finally {
                    enrichClient.release();
                }
            }

            // Enrich trip object with passenger info
            const enrichedTrip = {
                ...updatedTrip,
                passenger_phone: passengerPhone || '',
                passengerPhone: passengerPhone || '', // Support both formats
                passenger_name: passengerName || 'Walk-in Passenger',
                passengerName: passengerName || 'Walk-in Passenger', // Support both formats
            };

            this.logger.log(`✅ Trip ${tripId} accepted by driver ${driverUserId}`);

            return { success: true, trip: enrichedTrip };

        } catch (error) {
            await client.query('ROLLBACK');
            this.logger.error(`Error accepting support trip ${tripId}:`, error);
            return { success: false, error: 'Failed to accept trip' };
        } finally {
            client.release();
        }
    }

    /**
     * Decline a support trip and move to next driver in sequence
     */
    async declineSupportTrip(tripId: string, driverUserId: string, reason?: string): Promise<void> {
        try {
            this.logger.log(`Driver ${driverUserId} declined trip ${tripId} (reason: ${reason})`);

            // Get broadcast state
            const broadcastState = this.tripBroadcasts.get(tripId);
            if (!broadcastState) {
                this.logger.warn(`No broadcast state found for trip ${tripId}`);
                return;
            }

            // Cancel current timer
            if (broadcastState.timer) {
                clearTimeout(broadcastState.timer);
                broadcastState.timer = null;
            }

            // Move to next driver immediately
            broadcastState.currentIndex++;

            // Get the trip to broadcast to next driver
            const tripQuery = 'SELECT * FROM trips WHERE id = $1';
            const tripResult = await this.postgresService.query(tripQuery, [tripId]);

            if (tripResult.rows.length === 0) {
                this.logger.warn(`Trip ${tripId} not found for re-broadcast`);
                this.tripBroadcasts.delete(tripId);
                return;
            }

            const trip = tripResult.rows[0];
            await this.broadcastToNextDriver(trip, broadcastState);

        } catch (error) {
            this.logger.error(`Error declining support trip ${tripId}:`, error);
            throw error;
        }
    }

    async getActiveTrip(driverUserId: string) {
        try {
            // Get driver profile
            const driverProfile = await this.driverProfilesRepository.findByUserId(driverUserId);
            if (!driverProfile || !driverProfile.current_trip_id) {
                return null;
            }

            // Get active trip
            const tripQuery = `
        SELECT t.*, 
               dp.first_name as driver_first_name,
               dp.last_name as driver_last_name,
               v.make as vehicle_make,
               v.model as vehicle_model,
               v.plate_number as vehicle_plate
        FROM trips t
        LEFT JOIN driver_profiles dp ON t.driver_id = dp.id
        LEFT JOIN vehicles v ON t.vehicle_id = v.id
        WHERE t.id = $1 AND t.status IN ('requested', 'accepted', 'in_progress')
      `;

            const result = await this.postgresService.query(tripQuery, [driverProfile.current_trip_id]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0];

        } catch (error) {
            this.logger.error('Error getting active trip:', error);
            throw error;
        }
    }

    async startTrip(driverUserId: string, tripId: string) {
        const client = await this.postgresService.getClient();

        try {
            await client.query('BEGIN');

            // Verify driver owns this trip
            const driverProfile = await this.driverProfilesRepository.findByUserId(driverUserId);
            if (!driverProfile) {
                throw new HttpException('Driver profile not found', HttpStatus.NOT_FOUND);
            }

            // Check if trip exists and is in a valid status to start (accepted or in_progress)
            const checkTripQuery = `
                SELECT * FROM trips 
                WHERE id = $1 AND driver_id = $2 AND status IN ('accepted', 'in_progress')
            `;
            const checkResult = await client.query(checkTripQuery, [tripId, driverProfile.id]);

            if (checkResult.rows.length === 0) {
                await client.query('ROLLBACK');
                throw new HttpException('Trip not found or not in accepted/in_progress status', HttpStatus.NOT_FOUND);
            }

            const existingTrip = checkResult.rows[0];

            // Update trip: change status from 'accepted' to 'in_progress' and set timestamps
            const tripQuery = `
                UPDATE trips 
                SET status = 'in_progress',
                    started_at = NOW(),
                    trip_started_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1 AND driver_id = $2 AND status IN ('accepted', 'in_progress')
                RETURNING *
            `;

            const tripResult = await client.query(tripQuery, [tripId, driverProfile.id]);

            if (tripResult.rows.length === 0) {
                await client.query('ROLLBACK');
                throw new HttpException('Trip not found or not in accepted/in_progress status', HttpStatus.NOT_FOUND);
            }

            const trip = tripResult.rows[0];

            // Update driver pickup status from 'created' to 'accepted' for driver-initiated trips
            // Note: driver_pickups table may not have updated_at column, so we skip it
            const pickupQuery = `
        UPDATE driver_pickups 
        SET status = 'accepted'
        WHERE driver_id = $1 AND status = 'created'
        RETURNING *
      `;

            await client.query(pickupQuery, [driverProfile.id]);

            await client.query('COMMIT');

            // Sync trip status change with driver profile (status changed from 'accepted' to 'in_progress')
            try {
                await this.tripStatusSyncService.syncTripStatus(tripId, 'in_progress', driverProfile.id);
            } catch (syncError) {
                this.logger.warn(`Warning: Failed to sync trip status for ${tripId}:`, syncError);
                // Don't fail the entire operation if sync fails
            }

            this.logger.log(`✅ Trip started: ${tripId}, status changed from '${existingTrip.status}' to 'in_progress'`);
            return trip;

        } catch (error) {
            await client.query('ROLLBACK');
            this.logger.error('Error starting trip:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async cancelTrip(driverUserId: string, tripId: string, cancelData: any) {
        const client = await this.postgresService.getClient();

        try {
            await client.query('BEGIN');

            // Verify driver owns this trip
            const driverProfile = await this.driverProfilesRepository.findByUserId(driverUserId);
            if (!driverProfile) {
                throw new HttpException('Driver profile not found', HttpStatus.NOT_FOUND);
            }

            // Update trip status
            const tripQuery = `
        UPDATE trips 
        SET status = 'canceled', 
            canceled_at = NOW(),
            cancel_reason = $3,
            canceled_by_user_id = $4,
            updated_at = NOW()
        WHERE id = $1 AND driver_id = $2 AND status IN ('requested', 'accepted', 'in_progress')
        RETURNING *
      `;

            const tripResult = await client.query(tripQuery, [
                tripId,
                driverProfile.id,
                cancelData.reason || 'Driver canceled',
                driverProfile.user_id
            ]);

            if (tripResult.rows.length === 0) {
                throw new HttpException('Trip not found or cannot be canceled', HttpStatus.NOT_FOUND);
            }

            const trip = tripResult.rows[0];

            // Update driver pickup status
            const pickupQuery = `
        UPDATE driver_pickups 
        SET status = 'canceled',
            completed_at = NOW()
        WHERE driver_id = $1 AND status IN ('created', 'accepted')
        RETURNING *
      `;

            await client.query(pickupQuery, [driverProfile.id]);

            // Update driver profile to clear current trip
            await this.driverProfilesRepository.update(driverProfile.id, {
                current_trip_id: null,
                is_available: true
            });

            await client.query('COMMIT');

            // Sync trip status with driver profile
            await this.tripStatusSyncService.syncTripStatus(tripId, 'canceled', driverProfile.id);

            this.logger.log(`Trip canceled: ${tripId}`);
            return trip;

        } catch (error) {
            await client.query('ROLLBACK');
            this.logger.error('Error canceling trip:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async completeTrip(driverUserId: string, tripId: string, completeData: any) {
        const client = await this.postgresService.getClient();

        try {
            this.logger.log(`🚀 Starting trip completion for driver: ${driverUserId}, trip: ${tripId}`);
            this.logger.log(`📊 Complete data: ${JSON.stringify(completeData, null, 2)}`);

            await client.query('BEGIN');

            // Verify driver owns this trip
            const driverProfile = await this.driverProfilesRepository.findByUserId(driverUserId);
            if (!driverProfile) {
                throw new HttpException('Driver profile not found', HttpStatus.NOT_FOUND);
            }

            this.logger.log(`👤 Driver profile found: ${driverProfile.id}, current_trip_id: ${driverProfile.current_trip_id}`);

            // Calculate final fare if not provided
            let finalFare = completeData.final_fare;
            if (!finalFare) {
                finalFare = await this.calculateFare(
                    completeData.actual_distance_km || 0,
                    completeData.actual_duration_minutes || 0
                );
            }

            // Calculate earnings and commission
            const driverEarnings = completeData.driver_earnings || (finalFare * 0.85); // 85% to driver
            const commission = completeData.commission || (finalFare * 0.15); // 15% platform fee

            this.logger.log(`💰 Final fare: ${finalFare}, Driver earnings: ${driverEarnings}, Commission: ${commission}`);

            // First check the current trip status for better error messages
            const checkTripQuery = `
                SELECT id, status, driver_id FROM trips WHERE id = $1
            `;
            const checkTripResult = await client.query(checkTripQuery, [tripId]);

            if (checkTripResult.rows.length === 0) {
                await client.query('ROLLBACK');
                throw new HttpException(`Trip ${tripId} not found`, HttpStatus.NOT_FOUND);
            }

            const currentTrip = checkTripResult.rows[0];

            if (currentTrip.driver_id !== driverProfile.id) {
                await client.query('ROLLBACK');
                throw new HttpException('Trip does not belong to this driver', HttpStatus.FORBIDDEN);
            }

            if (currentTrip.status !== 'in_progress') {
                await client.query('ROLLBACK');
                this.logger.warn(`⚠️ Cannot complete trip ${tripId}: current status is '${currentTrip.status}', expected 'in_progress'`);
                throw new HttpException(`Trip is not in progress (current status: ${currentTrip.status})`, HttpStatus.BAD_REQUEST);
            }

            // Update trip status
            const tripQuery = `
                UPDATE trips 
                SET status = 'completed', 
                    completed_at = NOW(),
                    trip_completed_at = NOW(),
                    final_fare_cents = $3,
                    actual_distance_km = $4,
                    actual_duration_minutes = $5,
                    driver_earnings_cents = $6,
                    commission_cents = $7,
                    payment_status = 'completed',
                    updated_at = NOW()
                WHERE id = $1 AND driver_id = $2 AND status = 'in_progress'
                RETURNING *
            `;

            const tripResult = await client.query(tripQuery, [
                tripId,
                driverProfile.id,
                Math.round(finalFare * 100),
                completeData.actual_distance_km,
                completeData.actual_duration_minutes,
                Math.round(driverEarnings * 100),
                Math.round(commission * 100)
            ]);

            if (tripResult.rows.length === 0) {
                await client.query('ROLLBACK');
                this.logger.error(`❌ Failed to update trip ${tripId} to completed - trip may have been modified`);
                throw new HttpException('Trip not found or not in progress status', HttpStatus.NOT_FOUND);
            }

            const trip = tripResult.rows[0];
            this.logger.log(`✅ Trip updated to completed: ${trip.id}, status: ${trip.status}`);

            // Update driver pickup status
            const pickupQuery = `
        UPDATE driver_pickups 
        SET status = 'completed',
            final_fare_cents = $2,
            completed_at = NOW()
        WHERE driver_id = $1 AND status IN ('created', 'accepted')
        RETURNING *
      `;

            await client.query(pickupQuery, [
                driverProfile.id,
                Math.round((completeData.final_fare || 0) * 100)
            ]);

            // Update driver profile to clear current trip and update stats
            this.logger.log(`🔄 Updating driver profile: ${driverProfile.id}`);
            this.logger.log(`📈 Current stats - total_trips: ${driverProfile.total_trips}, total_earnings_cents: ${driverProfile.total_earnings_cents}`);

            // Calculate new earnings with safety check to prevent BigInt overflow
            const newEarningsCents = Math.round(driverEarnings * 100);

            // Use a more conservative maximum value for PostgreSQL bigint
            // PostgreSQL bigint range: -9223372036854775808 to 9223372036854775807
            // Use a much smaller maximum to avoid any edge cases
            const MAX_SAFE_EARNINGS = 9000000000000000000; // 9 * 10^18 (much smaller than max bigint)

            let finalTotalEarnings;
            if (driverProfile.total_earnings_cents >= MAX_SAFE_EARNINGS) {
                // If already at maximum, don't add more earnings
                finalTotalEarnings = driverProfile.total_earnings_cents;
                this.logger.warn(`⚠️ Driver earnings already at maximum (${MAX_SAFE_EARNINGS}), not adding more`);
            } else {
                const newTotalEarnings = driverProfile.total_earnings_cents + newEarningsCents;
                finalTotalEarnings = newTotalEarnings > MAX_SAFE_EARNINGS ? MAX_SAFE_EARNINGS : newTotalEarnings;

                this.logger.log(`💰 Adding earnings: ${newEarningsCents} cents, new total: ${finalTotalEarnings}`);
                if (finalTotalEarnings !== newTotalEarnings) {
                    this.logger.warn(`⚠️ BigInt overflow prevented! Capped at maximum safe value: ${finalTotalEarnings}`);
                }
            }

            await this.driverProfilesRepository.update(driverProfile.id, {
                current_trip_id: null,
                is_available: true,
                is_online: false,
                total_trips: driverProfile.total_trips + 1,
                total_earnings_cents: finalTotalEarnings
            });

            this.logger.log(`✅ Driver profile updated successfully`);

            await client.query('COMMIT');

            // Sync trip status with driver profile
            await this.tripStatusSyncService.syncTripStatus(tripId, 'completed', driverProfile.id);

            this.logger.log(`🎉 Trip completed successfully: ${tripId}`);
            return trip;

        } catch (error) {
            await client.query('ROLLBACK');
            this.logger.error('Error completing trip:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update trip status and sync with driver profile
     */
    async updateTripStatus(tripId: string, newStatus: string, driverId?: string): Promise<void> {
        try {
            await this.tripStatusSyncService.updateTripStatus(tripId, newStatus, driverId);
        } catch (error) {
            this.logger.error(`Error updating trip status for ${tripId}:`, error);
            throw error;
        }
    }

    async getTripHistory(
        driverUserId: string,
        page: number,
        limit: number,
        filters: {
            status?: string;
            startDate?: Date;
            endDate?: Date;
        } = {},
    ) {
        const client = await this.postgresService.getClient();

        try {
            // Get driver profile
            const driverProfile = await this.driverProfilesRepository.findByUserId(driverUserId);
            if (!driverProfile) {
                throw new HttpException('Driver profile not found', HttpStatus.NOT_FOUND);
            }

            // Build query conditions
            let whereConditions = ['t.driver_id = $1'];
            let queryParams: any[] = [driverProfile.id];
            let paramIndex = 2;

            if (filters.status) {
                whereConditions.push(`t.status = $${paramIndex}`);
                queryParams.push(filters.status);
                paramIndex++;
            }

            if (filters.startDate) {
                whereConditions.push(`t.request_timestamp >= $${paramIndex}`);
                queryParams.push(filters.startDate);
                paramIndex++;
            }

            if (filters.endDate) {
                whereConditions.push(`t.request_timestamp <= $${paramIndex}`);
                queryParams.push(filters.endDate);
                paramIndex++;
            }

            const whereClause = whereConditions.join(' AND ');

            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM trips t
                WHERE ${whereClause}
            `;
            const countResult = await client.query(countQuery, queryParams);
            const total = parseInt(countResult.rows[0].total, 10);

            // Get trips with pagination
            const offset = (page - 1) * limit;
            const tripsQuery = `
                SELECT 
                    t.*,
                    u.full_name as passenger_name,
                    u.phone_number as passenger_phone,
                    u.avatar_url as passenger_avatar_url,
                    v.make as vehicle_make,
                    v.model as vehicle_model,
                    v.plate_number as vehicle_plate_number,
                    v.color as vehicle_color
                FROM trips t
                LEFT JOIN users u ON t.passenger_id = u.id
                LEFT JOIN vehicles v ON t.vehicle_id = v.id
                WHERE ${whereClause}
                ORDER BY t.request_timestamp DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;

            queryParams.push(limit, offset);
            const tripsResult = await client.query(tripsQuery, queryParams);

            // Transform trips data
            const trips = tripsResult.rows.map(row => ({
                id: row.id,
                trip_reference: row.trip_reference,
                status: row.status,
                pickup_address: row.pickup_address,
                pickup_latitude: row.pickup_latitude,
                pickup_longitude: row.pickup_longitude,
                dropoff_address: row.dropoff_address,
                dropoff_latitude: row.dropoff_latitude,
                dropoff_longitude: row.dropoff_longitude,
                estimated_distance_km: row.estimated_distance_km,
                estimated_duration_minutes: row.estimated_duration_minutes,
                estimated_fare_cents: row.estimated_fare_cents,
                final_fare_cents: row.final_fare_cents,
                actual_distance_km: row.actual_distance_km,
                actual_duration_minutes: row.actual_duration_minutes,
                trip_type: row.trip_type,
                passenger_count: row.passenger_count,
                payment_method: row.payment_method,
                payment_status: row.payment_status,
                driver_earnings_cents: row.driver_earnings_cents,
                tip_cents: row.tip_cents,
                trip_notes: row.trip_notes,
                request_timestamp: row.request_timestamp,
                completed_at: row.completed_at,
                passenger_name: row.passenger_name,
                passenger_phone: row.passenger_phone,
                passenger_avatar_url: row.passenger_avatar_url,
                vehicle_make: row.vehicle_make,
                vehicle_model: row.vehicle_model,
                vehicle_plate_number: row.vehicle_plate_number,
                vehicle_color: row.vehicle_color,
            }));

            return {
                trips,
                total,
            };
        } catch (error) {
            this.logger.error(`Error fetching trip history:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    async getTripDetail(tripId: string, driverUserId: string) {
        const client = await this.postgresService.getClient();

        try {
            // Get driver profile
            const driverProfile = await this.driverProfilesRepository.findByUserId(driverUserId);
            if (!driverProfile) {
                throw new HttpException('Driver profile not found', HttpStatus.NOT_FOUND);
            }

            // Get trip details
            const tripQuery = `
                SELECT 
                    t.*,
                    u.full_name as passenger_name,
                    u.phone_number as passenger_phone,
                    u.avatar_url as passenger_avatar_url,
                    v.make as vehicle_make,
                    v.model as vehicle_model,
                    v.plate_number as vehicle_plate_number,
                    v.color as vehicle_color
                FROM trips t
                LEFT JOIN users u ON t.passenger_id = u.id
                LEFT JOIN vehicles v ON t.vehicle_id = v.id
                WHERE t.id = $1 AND t.driver_id = $2
            `;

            const tripResult = await client.query(tripQuery, [tripId, driverProfile.id]);

            if (tripResult.rows.length === 0) {
                return null;
            }

            const trip = tripResult.rows[0];

            // Get trip events (simplified for now)
            const events = [
                {
                    type: 'requested',
                    description: 'Trip requested',
                    timestamp: trip.request_timestamp,
                    metadata: {},
                },
            ];

            if (trip.accepted_at) {
                events.push({
                    type: 'accepted',
                    description: 'Trip accepted',
                    timestamp: trip.accepted_at,
                    metadata: {},
                });
            }

            if (trip.started_at) {
                events.push({
                    type: 'started',
                    description: 'Trip started',
                    timestamp: trip.started_at,
                    metadata: {},
                });
            }

            if (trip.completed_at) {
                events.push({
                    type: 'completed',
                    description: 'Trip completed',
                    timestamp: trip.completed_at,
                    metadata: {},
                });
            }

            // Sort events by timestamp
            events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            return {
                id: trip.id,
                trip_reference: trip.trip_reference,
                status: trip.status,
                pickup_address: trip.pickup_address,
                pickup_latitude: trip.pickup_latitude,
                pickup_longitude: trip.pickup_longitude,
                dropoff_address: trip.dropoff_address,
                dropoff_latitude: trip.dropoff_latitude,
                dropoff_longitude: trip.dropoff_longitude,
                estimated_distance_km: trip.estimated_distance_km,
                estimated_duration_minutes: trip.estimated_duration_minutes,
                estimated_fare_cents: trip.estimated_fare_cents,
                final_fare_cents: trip.final_fare_cents,
                actual_distance_km: trip.actual_distance_km,
                actual_duration_minutes: trip.actual_duration_minutes,
                trip_type: trip.trip_type,
                passenger_count: trip.passenger_count,
                payment_method: trip.payment_method,
                payment_status: trip.payment_status,
                driver_earnings_cents: trip.driver_earnings_cents,
                tip_cents: trip.tip_cents,
                trip_notes: trip.trip_notes,
                request_timestamp: trip.request_timestamp,
                accepted_at: trip.accepted_at,
                started_at: trip.started_at,
                completed_at: trip.completed_at,
                passenger_name: trip.passenger_name,
                passenger_phone: trip.passenger_phone,
                passenger_avatar_url: trip.passenger_avatar_url,
                vehicle_make: trip.vehicle_make,
                vehicle_model: trip.vehicle_model,
                vehicle_plate_number: trip.vehicle_plate_number,
                vehicle_color: trip.vehicle_color,
                events,
            };
        } catch (error) {
            this.logger.error(`Error fetching trip detail:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    async getTripStatistics(
        driverUserId: string,
        filters: {
            startDate?: Date;
            endDate?: Date;
        } = {},
    ) {
        const client = await this.postgresService.getClient();

        try {
            // Get driver profile
            const driverProfile = await this.driverProfilesRepository.findByUserId(driverUserId);
            if (!driverProfile) {
                throw new HttpException('Driver profile not found', HttpStatus.NOT_FOUND);
            }

            // Build date conditions
            let dateConditions = ['t.driver_id = $1'];
            let queryParams: any[] = [driverProfile.id];
            let paramIndex = 2;

            if (filters.startDate) {
                dateConditions.push(`t.request_timestamp >= $${paramIndex}`);
                queryParams.push(filters.startDate);
                paramIndex++;
            }

            if (filters.endDate) {
                dateConditions.push(`t.request_timestamp <= $${paramIndex}`);
                queryParams.push(filters.endDate);
                paramIndex++;
            }

            const whereClause = dateConditions.join(' AND ');

            // Get overall statistics
            const statsQuery = `
                SELECT 
                    COUNT(*) as total_trips,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_trips,
                    COUNT(CASE WHEN status = 'canceled' THEN 1 END) as canceled_trips,
                    COALESCE(SUM(driver_earnings_cents), 0) as total_earnings_cents,
                    COALESCE(AVG(driver_earnings_cents), 0) as average_fare_cents,
                    COALESCE(SUM(estimated_distance_km), 0) as total_distance_km,
                    COALESCE(SUM(estimated_duration_minutes), 0) as total_duration_minutes
                FROM trips t
                WHERE ${whereClause}
            `;

            const statsResult = await client.query(statsQuery, queryParams);
            const stats = statsResult.rows[0];

            // Get this week's statistics
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);

            const weekQuery = `
                SELECT 
                    COUNT(*) as this_week_trips,
                    COALESCE(SUM(driver_earnings_cents), 0) as this_week_earnings_cents
                FROM trips t
                WHERE t.driver_id = $1 AND t.request_timestamp >= $2
            `;

            const weekResult = await client.query(weekQuery, [driverProfile.id, weekStart]);
            const weekStats = weekResult.rows[0];

            // Get this month's statistics
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const monthQuery = `
                SELECT 
                    COUNT(*) as this_month_trips,
                    COALESCE(SUM(driver_earnings_cents), 0) as this_month_earnings_cents
                FROM trips t
                WHERE t.driver_id = $1 AND t.request_timestamp >= $2
            `;

            const monthResult = await client.query(monthQuery, [driverProfile.id, monthStart]);
            const monthStats = monthResult.rows[0];

            return {
                total_trips: parseInt(stats.total_trips, 10),
                completed_trips: parseInt(stats.completed_trips, 10),
                canceled_trips: parseInt(stats.canceled_trips, 10),
                total_earnings: parseFloat(stats.total_earnings_cents) / 100,
                average_rating: 0.0, // TODO: Implement rating system
                total_distance_km: parseInt(stats.total_distance_km, 10),
                total_duration_minutes: parseInt(stats.total_duration_minutes, 10),
                average_fare: parseFloat(stats.average_fare_cents) / 100,
                this_week_trips: parseInt(weekStats.this_week_trips, 10),
                this_month_trips: parseInt(monthStats.this_month_trips, 10),
                this_week_earnings: parseFloat(weekStats.this_week_earnings_cents) / 100,
                this_month_earnings: parseFloat(monthStats.this_month_earnings_cents) / 100,
            };
        } catch (error) {
            this.logger.error(`Error fetching trip statistics:`, error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Calculate estimated duration based on distance
     */
    private calculateEstimatedDuration(distanceKm: number): number {
        // Estimate duration based on distance
        // Assuming average speed of 30 km/h in city traffic
        const averageSpeedKmh = 30;
        const durationHours = distanceKm / averageSpeedKmh;
        const durationMinutes = Math.round(durationHours * 60);

        // Minimum 5 minutes, maximum 120 minutes
        return Math.max(5, Math.min(durationMinutes, 120));
    }

    /**
     * Calculate fare based on distance and duration
     */
    private async calculateFare(distanceKm: number, durationMinutes: number): Promise<number> {
        // Default rates (can be fetched from vehicle_types table later)
        const baseFare = 50.0; // 50 ETB base fare
        const ratePerKm = 15.0; // 15 ETB per km
        const ratePerMinute = 2.0; // 2 ETB per minute

        const calculatedFare = baseFare + (distanceKm * ratePerKm) + (durationMinutes * ratePerMinute);

        // Apply minimum fare
        const minimumFare = 100.0; // 100 ETB minimum

        return calculatedFare > minimumFare ? calculatedFare : minimumFare;
    }


}
