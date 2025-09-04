import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from '../interfaces/base-repository.interface';
import { Vehicle, CreateVehicleData, UpdateVehicleData } from '../entities/vehicle.entity';

@Injectable()
export class VehiclesRepository implements BaseRepository<Vehicle, CreateVehicleData, UpdateVehicleData> {
    private readonly logger = new Logger(VehiclesRepository.name);

    constructor(private readonly databaseService: DatabaseService) { }

    async findById(id: string): Promise<Vehicle | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('vehicles')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find vehicle by ID ${id}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            this.logger.error(`Error finding vehicle by ID ${id}:`, error);
            throw error;
        }
    }

    async findMany(filters?: Partial<Vehicle>): Promise<Vehicle[]> {
        try {
            let query = this.databaseService.client.from('vehicles').select('*');

            if (filters) {
                Object.entries(filters).forEach(([key, value]) => {
                    if (value !== undefined) {
                        query = query.eq(key, value);
                    }
                });
            }

            const { data, error } = await query;

            if (error) {
                this.logger.error('Failed to find vehicles:', error);
                throw error;
            }

            return data || [];
        } catch (error) {
            this.logger.error('Error finding vehicles:', error);
            throw error;
        }
    }

    async create(data: CreateVehicleData): Promise<Vehicle> {
        try {
            const { data: vehicle, error } = await this.databaseService.client
                .from('vehicles')
                .insert([data])
                .select()
                .single();

            if (error) {
                this.logger.error('Failed to create vehicle:', error);
                throw error;
            }

            this.logger.log(`✅ Vehicle created successfully: ${vehicle.id}`);
            return vehicle;
        } catch (error) {
            this.logger.error('Error creating vehicle:', error);
            throw error;
        }
    }

    async update(id: string, data: UpdateVehicleData): Promise<Vehicle | null> {
        try {
            const updateData = {
                ...data,
                updated_at: new Date().toISOString(),
            };

            const { data: vehicle, error } = await this.databaseService.client
                .from('vehicles')
                .update(updateData)
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to update vehicle ${id}:`, error);
                throw error;
            }

            if (vehicle) {
                this.logger.log(`✅ Vehicle updated successfully: ${id}`);
            }

            return vehicle;
        } catch (error) {
            this.logger.error(`Error updating vehicle ${id}:`, error);
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            // Soft delete by setting is_active to false
            const { data, error } = await this.databaseService.client
                .from('vehicles')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to delete vehicle ${id}:`, error);
                throw error;
            }

            const success = !!data;
            if (success) {
                this.logger.log(`✅ Vehicle soft deleted successfully: ${id}`);
            }

            return success;
        } catch (error) {
            this.logger.error(`Error deleting vehicle ${id}:`, error);
            throw error;
        }
    }

    async findByDriverId(driverId: string): Promise<Vehicle[]> {
        return this.findMany({ driver_id: driverId });
    }

    async findByPlateNumber(plateNumber: string): Promise<Vehicle | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('vehicles')
                .select('*')
                .eq('plate_number', plateNumber)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find vehicle by plate number ${plateNumber}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            this.logger.error(`Error finding vehicle by plate number ${plateNumber}:`, error);
            throw error;
        }
    }

    async findActiveVehiclesByDriverId(driverId: string): Promise<Vehicle[]> {
        return this.findMany({ driver_id: driverId, is_active: true });
    }

    async findVerifiedVehiclesByDriverId(driverId: string): Promise<Vehicle[]> {
        return this.findMany({
            driver_id: driverId,
            is_active: true,
            verification_status: 'verified'
        });
    }

    async countVehiclesByStatus(driverId?: string): Promise<{
        total: number;
        active: number;
        verified: number;
        pending: number;
        rejected: number;
    }> {
        try {
            const baseFilter = driverId ? { driver_id: driverId } : {};

            const [totalResult, activeResult, verifiedResult, pendingResult, rejectedResult] = await Promise.all([
                this.databaseService.client.from('vehicles').select('id', { count: 'exact' }).match(baseFilter),
                this.databaseService.client.from('vehicles').select('id', { count: 'exact' }).match({ ...baseFilter, is_active: true }),
                this.databaseService.client.from('vehicles').select('id', { count: 'exact' }).match({ ...baseFilter, verification_status: 'verified' }),
                this.databaseService.client.from('vehicles').select('id', { count: 'exact' }).match({ ...baseFilter, verification_status: 'pending_review' }),
                this.databaseService.client.from('vehicles').select('id', { count: 'exact' }).match({ ...baseFilter, verification_status: 'rejected' }),
            ]);

            return {
                total: totalResult.count || 0,
                active: activeResult.count || 0,
                verified: verifiedResult.count || 0,
                pending: pendingResult.count || 0,
                rejected: rejectedResult.count || 0,
            };
        } catch (error) {
            this.logger.error('Error counting vehicles by status:', error);
            throw error;
        }
    }

    async findWithVehicleClass(id: string): Promise<Vehicle & { vehicle_classes?: any } | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('vehicles')
                .select(`
                    *,
                    vehicle_classes!class_id (
                        id,
                        name,
                        description,
                        category,
                        seats,
                        base_fare_cents,
                        per_km_cents,
                        per_minute_cents
                    )
                `)
                .eq('id', id)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find vehicle with class ${id}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            this.logger.error(`Error finding vehicle with class ${id}:`, error);
            throw error;
        }
    }
}
