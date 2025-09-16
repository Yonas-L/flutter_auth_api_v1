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
}
