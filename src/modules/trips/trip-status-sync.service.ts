import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';
import { DriverProfilesPostgresRepository } from '../database/repositories/driver-profiles-postgres.repository';

@Injectable()
export class TripStatusSyncService {
    private readonly logger = new Logger(TripStatusSyncService.name);

    constructor(
        private readonly postgresService: PostgresService,
        private readonly driverProfilesRepository: DriverProfilesPostgresRepository,
    ) { }

    /**
     * Sync trip status changes with driver profile current_trip_id
     */
    async syncTripStatus(tripId: string, newStatus: string, driverId?: string): Promise<void> {
        try {
            this.logger.log(`🔄 Syncing trip status for trip ${tripId} to ${newStatus}`);

            // If driverId is not provided, get it from the trip
            if (!driverId) {
                const tripQuery = 'SELECT driver_id FROM trips WHERE id = $1';
                const tripResult = await this.postgresService.query(tripQuery, [tripId]);

                if (tripResult.rows.length === 0) {
                    this.logger.warn(`Trip ${tripId} not found`);
                    return;
                }

                driverId = tripResult.rows[0].driver_id;
            }

            if (!driverId) {
                this.logger.warn(`No driver ID found for trip ${tripId}`);
                return;
            }

            // Get driver profile by driver_id
            const driverProfile = await this.driverProfilesRepository.findById(driverId);
            if (!driverProfile) {
                this.logger.warn(`Driver profile not found for driver ${driverId}`);
                return;
            }

            // Update current_trip_id based on trip status
            let shouldUpdate = false;
            let newCurrentTripId = driverProfile.current_trip_id;

            switch (newStatus) {
                case 'accepted':
                case 'in_progress':
                    // Set current trip when trip is accepted or in progress
                    if (driverProfile.current_trip_id !== tripId) {
                        newCurrentTripId = tripId;
                        shouldUpdate = true;
                        this.logger.log(`Setting current trip for driver ${driverId} to ${tripId}`);
                    }
                    break;
                case 'completed':
                case 'canceled':
                case 'no_show':
                    // Clear current trip when trip is completed, canceled, or no show
                    if (driverProfile.current_trip_id === tripId) {
                        newCurrentTripId = null;
                        shouldUpdate = true;
                        this.logger.log(`Clearing current trip for driver ${driverId}`);
                    }
                    break;
                default:
                    // For other statuses, don't change current_trip_id
                    break;
            }

            // Update driver profile if needed
            if (shouldUpdate) {
                // Determine availability and online status based on trip status
                let isAvailable = false;
                let isOnline = true; // Driver should always be online during and after trips

                switch (newStatus) {
                    case 'accepted':
                    case 'in_progress':
                        // During trip: online but not available for new trips
                        isAvailable = false;
                        isOnline = true;
                        break;
                    case 'completed':
                    case 'canceled':
                    case 'no_show':
                        // Trip ended: online and available for new trips
                        isAvailable = true;
                        isOnline = true;
                        break;
                    default:
                        // For other statuses, maintain current state
                        break;
                }

                await this.driverProfilesRepository.update(driverId, {
                    current_trip_id: newCurrentTripId,
                    is_available: isAvailable,
                    is_online: isOnline
                });
                this.logger.log(`✅ Updated driver profile for driver ${driverId}: available=${isAvailable}, online=${isOnline}, trip_status=${newStatus}`);
            }

        } catch (error) {
            this.logger.error(`❌ Error syncing trip status for ${tripId}:`, error);
            throw error;
        }
    }

    /**
     * Update trip status and sync with driver profile
     */
    async updateTripStatus(tripId: string, newStatus: string, driverId?: string): Promise<void> {
        try {
            // Update trip status
            const updateQuery = `
                UPDATE trips 
                SET status = $1, updated_at = NOW()
                WHERE id = $2
            `;
            await this.postgresService.query(updateQuery, [newStatus, tripId]);

            // Sync with driver profile
            await this.syncTripStatus(tripId, newStatus, driverId);

            this.logger.log(`✅ Trip ${tripId} status updated to ${newStatus}`);
        } catch (error) {
            this.logger.error(`❌ Error updating trip status for ${tripId}:`, error);
            throw error;
        }
    }
}
