import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { DriverProfile, CreateDriverProfileData, UpdateDriverProfileData } from '../entities/driver-profile.entity';
import { BaseRepository } from '../interfaces/base-repository.interface';

@Injectable()
export class DriverProfilesRepository implements BaseRepository<DriverProfile, CreateDriverProfileData, UpdateDriverProfileData> {
    private readonly logger = new Logger(DriverProfilesRepository.name);

    constructor(private readonly databaseService: DatabaseService) { }

    async findById(id: string): Promise<DriverProfile | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('driver_profiles')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find driver profile by ID ${id}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            this.logger.error(`Error finding driver profile by ID ${id}:`, error);
            throw error;
        }
    }

    async findByUserId(userId: string): Promise<DriverProfile | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('driver_profiles')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find driver profile by user ID ${userId}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            this.logger.error(`Error finding driver profile by user ID ${userId}:`, error);
            throw error;
        }
    }

    async findMany(filters?: Partial<DriverProfile>): Promise<DriverProfile[]> {
        try {
            let query = this.databaseService.client.from('driver_profiles').select('*');

            if (filters) {
                Object.entries(filters).forEach(([key, value]) => {
                    if (value !== undefined) {
                        query = query.eq(key, value);
                    }
                });
            }

            const { data, error } = await query;

            if (error) {
                this.logger.error('Failed to find driver profiles:', error);
                throw error;
            }

            return data || [];
        } catch (error) {
            this.logger.error('Error finding driver profiles:', error);
            throw error;
        }
    }

    async create(profileData: CreateDriverProfileData): Promise<DriverProfile> {
        try {
            const createData = {
                ...profileData,
                verification_status: profileData.verification_status ?? 'unverified',
                years_of_experience: profileData.years_of_experience ?? 0,
                rating_avg: 0.00,
                rating_count: 0,
                total_trips: 0,
                total_earnings_cents: 0,
                is_available: false,
                is_online: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const { data, error } = await this.databaseService.client
                .from('driver_profiles')
                .insert(createData)
                .select()
                .single();

            if (error) {
                this.logger.error('Failed to create driver profile:', error);
                throw error;
            }

            this.logger.log(`✅ Driver profile created successfully: ${data.id}`);
            return data;
        } catch (error) {
            this.logger.error('Error creating driver profile:', error);
            throw error;
        }
    }

    async update(id: string, updateData: UpdateDriverProfileData): Promise<DriverProfile | null> {
        try {
            const dataToUpdate = {
                ...updateData,
                updated_at: new Date().toISOString(),
            };

            const { data, error } = await this.databaseService.client
                .from('driver_profiles')
                .update(dataToUpdate)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                this.logger.error(`Failed to update driver profile ${id}:`, error);
                throw error;
            }

            this.logger.log(`✅ Driver profile updated successfully: ${id}`);
            return data;
        } catch (error) {
            this.logger.error(`Error updating driver profile ${id}:`, error);
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const { error } = await this.databaseService.client
                .from('driver_profiles')
                .delete()
                .eq('id', id);

            if (error) {
                this.logger.error(`Failed to delete driver profile ${id}:`, error);
                throw error;
            }

            this.logger.log(`✅ Driver profile deleted successfully: ${id}`);
            return true;
        } catch (error) {
            this.logger.error(`Error deleting driver profile ${id}:`, error);
            throw error;
        }
    }

    /**
     * Check if driver exists by license number
     */
    async existsByLicenseNumber(licenseNumber: string): Promise<boolean> {
        try {
            const { data, error } = await this.databaseService.client
                .from('driver_profiles')
                .select('id')
                .eq('driver_license_number', licenseNumber)
                .limit(1);

            if (error) {
                this.logger.error(`Failed to check driver existence by license ${licenseNumber}:`, error);
                throw error;
            }

            return (data?.length ?? 0) > 0;
        } catch (error) {
            this.logger.error(`Error checking driver existence by license ${licenseNumber}:`, error);
            throw error;
        }
    }
}
