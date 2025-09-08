import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from '../postgres.service';
import { Trip, CreateTripData, UpdateTripData } from '../entities/trip.entity';
import { BasePostgresRepository } from './base-postgres.repository';

@Injectable()
export class TripsPostgresRepository extends BasePostgresRepository<Trip, CreateTripData, UpdateTripData> {
    protected tableName = 'trips';

    constructor(postgresService: PostgresService) {
        super(postgresService);
    }

    async findByPassengerId(passengerId: string): Promise<Trip[]> {
        try {
            const query = `
                SELECT * FROM ${this.tableName} 
                WHERE passenger_id = $1 
                ORDER BY created_at DESC
            `;
            const result = await this.query(query, [passengerId]);
            
            return result.rows as Trip[];
        } catch (error) {
            this.logger.error(`Error finding trips for passenger ${passengerId}:`, error);
            throw error;
        }
    }

    async findByDriverId(driverId: string): Promise<Trip[]> {
        try {
            const query = `
                SELECT * FROM ${this.tableName} 
                WHERE driver_id = $1 
                ORDER BY created_at DESC
            `;
            const result = await this.query(query, [driverId]);
            
            return result.rows as Trip[];
        } catch (error) {
            this.logger.error(`Error finding trips for driver ${driverId}:`, error);
            throw error;
        }
    }

    async findByStatus(status: Trip['status']): Promise<Trip[]> {
        try {
            const query = `
                SELECT * FROM ${this.tableName} 
                WHERE status = $1 
                ORDER BY created_at DESC
            `;
            const result = await this.query(query, [status]);
            
            return result.rows as Trip[];
        } catch (error) {
            this.logger.error(`Error finding trips with status ${status}:`, error);
            throw error;
        }
    }

    async findActiveTrips(): Promise<Trip[]> {
        try {
            const query = `
                SELECT * FROM ${this.tableName} 
                WHERE status IN ('requested', 'accepted', 'in_progress') 
                ORDER BY created_at DESC
            `;
            const result = await this.query(query);
            
            return result.rows as Trip[];
        } catch (error) {
            this.logger.error('Error finding active trips:', error);
            throw error;
        }
    }

    async findCompletedTrips(passengerId?: string, driverId?: string): Promise<Trip[]> {
        try {
            let query = `SELECT * FROM ${this.tableName} WHERE status = 'completed'`;
            const values: any[] = [];
            let paramIndex = 1;

            if (passengerId) {
                query += ` AND passenger_id = $${paramIndex++}`;
                values.push(passengerId);
            }

            if (driverId) {
                query += ` AND driver_id = $${paramIndex++}`;
                values.push(driverId);
            }

            query += ` ORDER BY completed_at DESC`;

            const result = await this.query(query, values);
            return result.rows as Trip[];
        } catch (error) {
            this.logger.error('Error finding completed trips:', error);
            throw error;
        }
    }

    async findByTripReference(tripReference: string): Promise<Trip | null> {
        try {
            const query = `SELECT * FROM ${this.tableName} WHERE trip_reference = $1`;
            const result = await this.query(query, [tripReference]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return result.rows[0] as Trip;
        } catch (error) {
            this.logger.error(`Error finding trip by reference ${tripReference}:`, error);
            throw error;
        }
    }

    async findNearbyTrips(latitude: number, longitude: number, radiusKm: number = 5): Promise<Trip[]> {
        try {
            const query = `
                SELECT * FROM ${this.tableName}
                WHERE status = 'requested'
                AND pickup_point IS NOT NULL
                AND ST_DWithin(
                    pickup_point::geometry,
                    ST_SetSRID(ST_MakePoint($2, $3), 4326)::geometry,
                    $4 * 1000
                )
                ORDER BY ST_Distance(
                    pickup_point::geometry,
                    ST_SetSRID(ST_MakePoint($2, $3), 4326)::geometry
                )
            `;
            const result = await this.query(query, [latitude, longitude, radiusKm]);
            
            return result.rows as Trip[];
        } catch (error) {
            this.logger.error(`Error finding nearby trips:`, error);
            throw error;
        }
    }

    async updateStatus(id: string, status: Trip['status'], additionalData?: Partial<UpdateTripData>): Promise<Trip | null> {
        try {
            const updateData: UpdateTripData = { status, ...additionalData };
            
            // Add timestamp based on status
            const now = new Date().toISOString();
            switch (status) {
                case 'accepted':
                    updateData.accepted_at = now;
                    break;
                case 'in_progress':
                    updateData.started_at = now;
                    updateData.trip_started_at = now;
                    break;
                case 'completed':
                    updateData.completed_at = now;
                    updateData.trip_completed_at = now;
                    break;
                case 'canceled':
                    updateData.canceled_at = now;
                    break;
            }

            return await this.update(id, updateData);
        } catch (error) {
            this.logger.error(`Error updating trip status ${id} to ${status}:`, error);
            throw error;
        }
    }

    async assignDriver(tripId: string, driverId: string, vehicleId?: string): Promise<Trip | null> {
        try {
            const updateData: UpdateTripData = {
                driver_id: driverId,
                vehicle_id: vehicleId,
                status: 'accepted',
                accepted_at: new Date().toISOString(),
                driver_assigned_at: new Date().toISOString()
            };

            return await this.update(tripId, updateData);
        } catch (error) {
            this.logger.error(`Error assigning driver ${driverId} to trip ${tripId}:`, error);
            throw error;
        }
    }

    async completeTrip(tripId: string, finalFareCents: number, actualDistanceKm?: number, actualDurationMinutes?: number): Promise<Trip | null> {
        try {
            const updateData: UpdateTripData = {
                status: 'completed',
                final_fare_cents: finalFareCents,
                actual_distance_km: actualDistanceKm,
                actual_duration_minutes: actualDurationMinutes,
                completed_at: new Date().toISOString(),
                trip_completed_at: new Date().toISOString()
            };

            return await this.update(tripId, updateData);
        } catch (error) {
            this.logger.error(`Error completing trip ${tripId}:`, error);
            throw error;
        }
    }

    async cancelTrip(tripId: string, canceledByUserId: string, reason?: string): Promise<Trip | null> {
        try {
            const updateData: UpdateTripData = {
                status: 'canceled',
                canceled_by_user_id: canceledByUserId,
                cancel_reason: reason,
                canceled_at: new Date().toISOString()
            };

            return await this.update(tripId, updateData);
        } catch (error) {
            this.logger.error(`Error canceling trip ${tripId}:`, error);
            throw error;
        }
    }

    async addRating(tripId: string, rating: number, comment: string, ratedBy: 'passenger' | 'driver'): Promise<Trip | null> {
        try {
            const updateData: UpdateTripData = {};
            
            if (ratedBy === 'passenger') {
                updateData.passenger_rating = rating;
                updateData.passenger_comment = comment;
            } else {
                updateData.driver_rating = rating;
                updateData.driver_comment = comment;
            }

            return await this.update(tripId, updateData);
        } catch (error) {
            this.logger.error(`Error adding ${ratedBy} rating for trip ${tripId}:`, error);
            throw error;
        }
    }

    async getTripStats(passengerId?: string, driverId?: string, dateFrom?: string, dateTo?: string): Promise<{
        total: number;
        completed: number;
        canceled: number;
        totalEarnings: number;
        averageRating: number;
    }> {
        try {
            let whereClause = '1=1';
            const values: any[] = [];
            let paramIndex = 1;

            if (passengerId) {
                whereClause += ` AND passenger_id = $${paramIndex++}`;
                values.push(passengerId);
            }

            if (driverId) {
                whereClause += ` AND driver_id = $${paramIndex++}`;
                values.push(driverId);
            }

            if (dateFrom) {
                whereClause += ` AND created_at >= $${paramIndex++}`;
                values.push(dateFrom);
            }

            if (dateTo) {
                whereClause += ` AND created_at <= $${paramIndex++}`;
                values.push(dateTo);
            }

            const query = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                    COUNT(CASE WHEN status = 'canceled' THEN 1 END) as canceled,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN final_fare_cents ELSE 0 END), 0) as total_earnings,
                    COALESCE(AVG(CASE WHEN status = 'completed' THEN passenger_rating END), 0) as average_rating
                FROM ${this.tableName}
                WHERE ${whereClause}
            `;

            const result = await this.query(query, values);
            const row = result.rows[0];

            return {
                total: parseInt(row.total),
                completed: parseInt(row.completed),
                canceled: parseInt(row.canceled),
                totalEarnings: parseInt(row.total_earnings),
                averageRating: parseFloat(row.average_rating) || 0
            };
        } catch (error) {
            this.logger.error('Error getting trip stats:', error);
            throw error;
        }
    }

    async findTripsByDateRange(startDate: string, endDate: string, status?: Trip['status']): Promise<Trip[]> {
        try {
            let query = `
                SELECT * FROM ${this.tableName}
                WHERE created_at >= $1 AND created_at <= $2
            `;
            const values: any[] = [startDate, endDate];
            let paramIndex = 3;

            if (status) {
                query += ` AND status = $${paramIndex++}`;
                values.push(status);
            }

            query += ` ORDER BY created_at DESC`;

            const result = await this.query(query, values);
            return result.rows as Trip[];
        } catch (error) {
            this.logger.error(`Error finding trips by date range:`, error);
            throw error;
        }
    }
}
