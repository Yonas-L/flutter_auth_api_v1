import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';
import { DriverProfilesPostgresRepository } from '../database/repositories/driver-profiles-postgres.repository';
import { VehiclesPostgresRepository } from '../database/repositories/vehicles-postgres.repository';
import { TripStatusSyncService } from './trip-status-sync.service';

@Injectable()
export class TripsService {
    private readonly logger = new Logger(TripsService.name);

    constructor(
        private readonly postgresService: PostgresService,
        private readonly driverProfilesRepository: DriverProfilesPostgresRepository,
        private readonly vehiclesRepository: VehiclesPostgresRepository,
        private readonly tripStatusSyncService: TripStatusSyncService,
    ) { }

    async createTrip(driverUserId: string, createTripDto: any) {
        const client = await this.postgresService.getClient();

        try {
            this.logger.log(`Starting trip creation for driver: ${driverUserId}`);
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

            // Ensure we have a passenger ID
            if (!passengerId) {
                throw new HttpException('Passenger ID is required', HttpStatus.BAD_REQUEST);
            }

            // Generate trip reference
            const tripReference = `TRP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

            // Create trip record
            const tripQuery = `
        INSERT INTO trips (
          passenger_id,
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
          trip_reference
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, ST_Point($9, $10)::point,
          $11, $12, $13, ST_Point($14, $15)::point, $16, $17, $18, $19, $20, $21, $22, $23, $24
        ) RETURNING *
      `;

            const tripValues = [
                passengerId, // Now guaranteed to have a valid passenger ID
                driverProfile.id,
                activeVehicle.id,
                activeVehicle.vehicle_type_id, // Use the correct field name
                'accepted', // Driver-initiated trips start as accepted
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
                createTripDto.estimated_duration_minutes,
                Math.round((createTripDto.estimated_fare || 0) * 100), // Convert to cents
                createTripDto.trip_type || 'standard',
                createTripDto.passenger_count || 1,
                createTripDto.payment_method || 'cash',
                'pending',
                new Date(),
                tripReference
            ];

            this.logger.log('Creating trip record...');
            this.logger.log(`Trip values: ${JSON.stringify(tripValues, null, 2)}`);

            const tripResult = await client.query(tripQuery, tripValues);
            const trip = tripResult.rows[0];
            this.logger.log(`Trip created successfully: ${trip.id}`);

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
                'accepted', // Driver-initiated pickups start as accepted
                createTripDto.notes || null
            ];

            this.logger.log(`Pickup values: ${JSON.stringify(pickupValues, null, 2)}`);
            const pickupResult = await client.query(pickupQuery, pickupValues);
            const driverPickup = pickupResult.rows[0];
            this.logger.log(`Driver pickup created: ${driverPickup.id}`);

            // Update driver profile to set current trip
            this.logger.log('Updating driver profile...');
            await this.driverProfilesRepository.update(driverProfile.id, {
                current_trip_id: trip.id,
                is_available: false
            });
            this.logger.log('Driver profile updated successfully');

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

            // Update trip status
            const tripQuery = `
        UPDATE trips 
        SET status = 'in_progress', 
            started_at = NOW(),
            trip_started_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND driver_id = $2 AND status = 'accepted'
        RETURNING *
      `;

            const tripResult = await client.query(tripQuery, [tripId, driverProfile.id]);

            if (tripResult.rows.length === 0) {
                throw new HttpException('Trip not found or not in accepted status', HttpStatus.NOT_FOUND);
            }

            const trip = tripResult.rows[0];

            // Update driver pickup status
            const pickupQuery = `
        UPDATE driver_pickups 
        SET status = 'completed',
            completed_at = NOW()
        WHERE driver_id = $1 AND status = 'accepted'
        RETURNING *
      `;

            await client.query(pickupQuery, [driverProfile.id]);

            await client.query('COMMIT');

            this.logger.log(`Trip started: ${tripId}`);
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
            await client.query('BEGIN');

            // Verify driver owns this trip
            const driverProfile = await this.driverProfilesRepository.findByUserId(driverUserId);
            if (!driverProfile) {
                throw new HttpException('Driver profile not found', HttpStatus.NOT_FOUND);
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
            updated_at = NOW()
        WHERE id = $1 AND driver_id = $2 AND status = 'in_progress'
        RETURNING *
      `;

            const tripResult = await client.query(tripQuery, [
                tripId,
                driverProfile.id,
                Math.round((completeData.final_fare || 0) * 100),
                completeData.actual_distance_km,
                completeData.actual_duration_minutes,
                Math.round((completeData.driver_earnings || 0) * 100),
                Math.round((completeData.commission || 0) * 100)
            ]);

            if (tripResult.rows.length === 0) {
                throw new HttpException('Trip not found or not in progress', HttpStatus.NOT_FOUND);
            }

            const trip = tripResult.rows[0];

            // Update driver pickup status
            const pickupQuery = `
        UPDATE driver_pickups 
        SET status = 'completed',
            final_fare_cents = $2,
            completed_at = NOW()
        WHERE driver_id = $1 AND status = 'accepted'
        RETURNING *
      `;

            await client.query(pickupQuery, [
                driverProfile.id,
                Math.round((completeData.final_fare || 0) * 100)
            ]);

            // Update driver profile to clear current trip and update stats
            await this.driverProfilesRepository.update(driverProfile.id, {
                current_trip_id: null,
                is_available: true,
                total_trips: driverProfile.total_trips + 1,
                total_earnings_cents: driverProfile.total_earnings_cents + Math.round((completeData.driver_earnings || 0) * 100)
            });

            await client.query('COMMIT');

            this.logger.log(`Trip completed: ${tripId}`);
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
                    v.license_plate as vehicle_plate_number,
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
                    v.license_plate as vehicle_plate_number,
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
}
