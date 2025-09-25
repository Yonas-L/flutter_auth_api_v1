import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from '../postgres.service';

export interface DriverProfile {
    id: string;
    user_id: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
    date_of_birth?: string;
    gender?: 'male' | 'female' | 'other' | 'Male' | 'Female' | 'Other';
    city?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    driver_license_number?: string;
    driver_license_expiry?: string;
    years_of_experience: number;
    rating_avg: number;
    rating_count: number;
    total_trips: number;
    total_earnings_cents: number;
    is_available: boolean;
    is_online: boolean;
    verification_status: 'unverified' | 'pending_review' | 'verified' | 'rejected';
    last_known_location?: string;
    last_location_update?: string;
    current_trip_id?: string | null;
    socket_id?: string;
    created_at: string;
    updated_at: string;
}

export interface CreateDriverProfileData {
    user_id: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    gender?: 'male' | 'female' | 'other' | 'Male' | 'Female' | 'Other';
    city?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    driver_license_number?: string;
    driver_license_expiry?: string;
    years_of_experience?: number;
}

export interface UpdateDriverProfileData {
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    gender?: 'male' | 'female' | 'other' | 'Male' | 'Female' | 'Other';
    city?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    driver_license_number?: string;
    driver_license_expiry?: string;
    years_of_experience?: number;
    rating_avg?: number;
    rating_count?: number;
    total_trips?: number;
    total_earnings_cents?: number;
    is_available?: boolean;
    is_online?: boolean;
    verification_status?: 'unverified' | 'pending_review' | 'verified' | 'rejected';
    last_known_location?: string;
    last_location_update?: string;
    current_trip_id?: string | null;
    socket_id?: string;
}

@Injectable()
export class DriverProfilesPostgresRepository {
    private readonly logger = new Logger(DriverProfilesPostgresRepository.name);

    constructor(private readonly postgresService: PostgresService) { }

    async findById(id: string): Promise<DriverProfile | null> {
        try {
            const query = 'SELECT * FROM driver_profiles WHERE id = $1';
            const result = await this.postgresService.query(query, [id]);

            if (result.rows.length === 0) {
                return null;
            }

            return this.mapRowToDriverProfile(result.rows[0]);
        } catch (error) {
            this.logger.error(`Error finding driver profile by id ${id}:`, error);
            throw error;
        }
    }

    async findByUserId(userId: string): Promise<DriverProfile | null> {
        try {
            const query = `
                SELECT dp.*, u.avatar_url, u.full_name as user_full_name
                FROM driver_profiles dp
                LEFT JOIN users u ON dp.user_id = u.id
                WHERE dp.user_id = $1
            `;
            const result = await this.postgresService.query(query, [userId]);

            if (result.rows.length === 0) {
                return null;
            }

            return this.mapRowToDriverProfile(result.rows[0]);
        } catch (error) {
            this.logger.error(`Error finding driver profile by user_id ${userId}:`, error);
            throw error;
        }
    }

    async findMany(filters: Partial<DriverProfile> = {}): Promise<DriverProfile[]> {
        try {
            let query = 'SELECT * FROM driver_profiles WHERE 1=1';
            const values: any[] = [];
            let paramCount = 0;

            if (filters.user_id) {
                paramCount++;
                query += ` AND user_id = $${paramCount}`;
                values.push(filters.user_id);
            }

            if (filters.verification_status) {
                paramCount++;
                query += ` AND verification_status = $${paramCount}`;
                values.push(filters.verification_status);
            }

            if (filters.is_available !== undefined) {
                paramCount++;
                query += ` AND is_available = $${paramCount}`;
                values.push(filters.is_available);
            }

            if (filters.is_online !== undefined) {
                paramCount++;
                query += ` AND is_online = $${paramCount}`;
                values.push(filters.is_online);
            }

            query += ' ORDER BY created_at DESC';

            const result = await this.postgresService.query(query, values);
            return result.rows.map(row => this.mapRowToDriverProfile(row));
        } catch (error) {
            this.logger.error('Error finding driver profiles:', error);
            throw error;
        }
    }

    async create(data: CreateDriverProfileData): Promise<DriverProfile> {
        try {
            const query = `
        INSERT INTO driver_profiles (
          user_id, first_name, last_name, date_of_birth, gender, city,
          emergency_contact_name, emergency_contact_phone, driver_license_number,
          driver_license_expiry, years_of_experience
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        ) RETURNING *
      `;

            const values = [
                data.user_id,
                data.first_name || null,
                data.last_name || null,
                data.date_of_birth || null,
                data.gender || null,
                data.city || null,
                data.emergency_contact_name || null,
                data.emergency_contact_phone || null,
                data.driver_license_number || null,
                data.driver_license_expiry || null,
                data.years_of_experience || 0
            ];

            const result = await this.postgresService.query(query, values);
            return this.mapRowToDriverProfile(result.rows[0]);
        } catch (error) {
            this.logger.error('Error creating driver profile:', error);
            throw error;
        }
    }

    async update(id: string, data: UpdateDriverProfileData): Promise<DriverProfile | null> {
        try {
            this.logger.log(`🔄 DriverProfilesPostgresRepository.update called for ${id}:`, data);

            const fields: string[] = [];
            const values: any[] = [];
            let paramCount = 0;

            Object.entries(data).forEach(([key, value]) => {
                if (value !== undefined) {
                    paramCount++;
                    fields.push(`${key} = $${paramCount}`);
                    values.push(value);
                }
            });

            if (fields.length === 0) {
                this.logger.log(`⚠️ No fields to update for driver profile ${id}`);
                return this.findById(id);
            }

            paramCount++;
            fields.push(`updated_at = NOW()`);
            values.push(id);

            const query = `
        UPDATE driver_profiles 
        SET ${fields.join(', ')} 
        WHERE id = $${paramCount} 
        RETURNING *
      `;

            this.logger.log(`🔄 Executing update query:`, { query, values });

            const result = await this.postgresService.query(query, values);

            this.logger.log(`🔄 Update query result:`, {
                rowCount: result.rows.length,
                rows: result.rows
            });

            if (result.rows.length === 0) {
                this.logger.error(`❌ No rows updated for driver profile ${id}`);
                return null;
            }

            const updatedProfile = this.mapRowToDriverProfile(result.rows[0]);
            this.logger.log(`✅ Successfully updated driver profile ${id}:`, {
                is_online: updatedProfile.is_online,
                is_available: updatedProfile.is_available,
                socket_id: updatedProfile.socket_id
            });

            return updatedProfile;
        } catch (error) {
            this.logger.error(`❌ Error updating driver profile ${id}:`, error);
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const query = 'DELETE FROM driver_profiles WHERE id = $1';
            const result = await this.postgresService.query(query, [id]);
            return result.rowCount > 0;
        } catch (error) {
            this.logger.error(`Error deleting driver profile ${id}:`, error);
            throw error;
        }
    }

    private mapRowToDriverProfile(row: any): DriverProfile {
        return {
            id: row.id,
            user_id: row.user_id,
            full_name: row.full_name || row.user_full_name,
            first_name: row.first_name,
            last_name: row.last_name,
            avatar_url: row.avatar_url,
            date_of_birth: row.date_of_birth,
            gender: row.gender,
            city: row.city,
            emergency_contact_name: row.emergency_contact_name,
            emergency_contact_phone: row.emergency_contact_phone,
            driver_license_number: row.driver_license_number,
            driver_license_expiry: row.driver_license_expiry,
            years_of_experience: row.years_of_experience,
            rating_avg: parseFloat(row.rating_avg) || 0,
            rating_count: row.rating_count,
            total_trips: row.total_trips,
            total_earnings_cents: row.total_earnings_cents,
            is_available: row.is_available,
            is_online: row.is_online,
            verification_status: row.verification_status,
            last_known_location: row.last_known_location,
            last_location_update: row.last_location_update,
            current_trip_id: row.current_trip_id,
            socket_id: row.socket_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
}
