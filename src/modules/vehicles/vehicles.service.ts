import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { VehiclesRepository } from '../database/repositories/vehicles.repository';
import { DriverProfilesRepository } from '../database/repositories/driver-profiles.repository';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleResponseDto, VehicleStatsDto, DriverVehiclesSummaryDto } from './dto/vehicle-response.dto';
import { Vehicle } from '../database/entities/vehicle.entity';

@Injectable()
export class VehiclesService {
    private readonly logger = new Logger(VehiclesService.name);

    constructor(
        private readonly vehiclesRepository: VehiclesRepository,
        private readonly driverProfilesRepository: DriverProfilesRepository,
    ) { }

    /**
     * Create a new vehicle
     */
    async create(createVehicleDto: CreateVehicleDto): Promise<VehicleResponseDto> {
        try {
            // Verify driver exists
            const driver = await this.driverProfilesRepository.findById(createVehicleDto.driver_id);
            if (!driver) {
                throw new NotFoundException('Driver profile not found');
            }

            // Check if plate number already exists
            const existingVehicle = await this.vehiclesRepository.findByPlateNumber(createVehicleDto.plate_number);
            if (existingVehicle) {
                throw new ConflictException('A vehicle with this plate number already exists');
            }

            // Create the vehicle
            const vehicle = await this.vehiclesRepository.create({
                ...createVehicleDto,
                verification_status: createVehicleDto.verification_status || 'pending_review',
                is_active: createVehicleDto.is_active ?? true,
            });

            this.logger.log(`✅ Vehicle created successfully: ${vehicle.id} for driver ${createVehicleDto.driver_id}`);
            return new VehicleResponseDto(vehicle);
        } catch (error) {
            this.logger.error('Error creating vehicle:', error);
            throw error;
        }
    }

    /**
     * Get vehicle by ID
     */
    async findById(id: string): Promise<VehicleResponseDto> {
        try {
            const vehicle = await this.vehiclesRepository.findById(id);
            if (!vehicle) {
                throw new NotFoundException('Vehicle not found');
            }
            return new VehicleResponseDto(vehicle);
        } catch (error) {
            this.logger.error(`Error finding vehicle ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get vehicle with class information
     */
    async findByIdWithClass(id: string): Promise<VehicleResponseDto> {
        try {
            const vehicle = await this.vehiclesRepository.findWithVehicleClass(id);
            if (!vehicle) {
                throw new NotFoundException('Vehicle not found');
            }

            const response = new VehicleResponseDto(vehicle);
            if (vehicle.vehicle_classes) {
                response.vehicle_class = vehicle.vehicle_classes;
            }

            return response;
        } catch (error) {
            this.logger.error(`Error finding vehicle with class ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get all vehicles with optional filters
     */
    async findAll(filters?: Partial<Vehicle>): Promise<VehicleResponseDto[]> {
        try {
            const vehicles = await this.vehiclesRepository.findMany(filters);
            return vehicles.map(vehicle => new VehicleResponseDto(vehicle));
        } catch (error) {
            this.logger.error('Error finding vehicles:', error);
            throw error;
        }
    }

    /**
     * Get vehicles by driver ID
     */
    async findByDriverId(driverId: string): Promise<VehicleResponseDto[]> {
        try {
            const vehicles = await this.vehiclesRepository.findByDriverId(driverId);
            return vehicles.map(vehicle => new VehicleResponseDto(vehicle));
        } catch (error) {
            this.logger.error(`Error finding vehicles for driver ${driverId}:`, error);
            throw error;
        }
    }

    /**
     * Get active vehicles by driver ID
     */
    async findActiveByDriverId(driverId: string): Promise<VehicleResponseDto[]> {
        try {
            const vehicles = await this.vehiclesRepository.findActiveVehiclesByDriverId(driverId);
            return vehicles.map(vehicle => new VehicleResponseDto(vehicle));
        } catch (error) {
            this.logger.error(`Error finding active vehicles for driver ${driverId}:`, error);
            throw error;
        }
    }

    /**
     * Get verified vehicles by driver ID
     */
    async findVerifiedByDriverId(driverId: string): Promise<VehicleResponseDto[]> {
        try {
            const vehicles = await this.vehiclesRepository.findVerifiedVehiclesByDriverId(driverId);
            return vehicles.map(vehicle => new VehicleResponseDto(vehicle));
        } catch (error) {
            this.logger.error(`Error finding verified vehicles for driver ${driverId}:`, error);
            throw error;
        }
    }

    /**
     * Update vehicle
     */
    async update(id: string, updateVehicleDto: UpdateVehicleDto): Promise<VehicleResponseDto> {
        try {
            // Check if plate number is being updated and if it conflicts
            if (updateVehicleDto.plate_number) {
                const existingVehicle = await this.vehiclesRepository.findByPlateNumber(updateVehicleDto.plate_number);
                if (existingVehicle && existingVehicle.id !== id) {
                    throw new ConflictException('A vehicle with this plate number already exists');
                }
            }

            const vehicle = await this.vehiclesRepository.update(id, updateVehicleDto);
            if (!vehicle) {
                throw new NotFoundException('Vehicle not found');
            }

            this.logger.log(`✅ Vehicle updated successfully: ${id}`);
            return new VehicleResponseDto(vehicle);
        } catch (error) {
            this.logger.error(`Error updating vehicle ${id}:`, error);
            throw error;
        }
    }

    /**
     * Delete vehicle (soft delete)
     */
    async delete(id: string): Promise<boolean> {
        try {
            const result = await this.vehiclesRepository.delete(id);
            if (result) {
                this.logger.log(`✅ Vehicle deleted successfully: ${id}`);
            }
            return result;
        } catch (error) {
            this.logger.error(`Error deleting vehicle ${id}:`, error);
            throw error;
        }
    }

    /**
     * Update vehicle verification status
     */
    async updateVerificationStatus(
        id: string,
        status: 'pending_review' | 'verified' | 'rejected'
    ): Promise<VehicleResponseDto> {
        try {
            const vehicle = await this.vehiclesRepository.update(id, {
                verification_status: status,
            });

            if (!vehicle) {
                throw new NotFoundException('Vehicle not found');
            }

            this.logger.log(`✅ Vehicle verification status updated: ${id} -> ${status}`);
            return new VehicleResponseDto(vehicle);
        } catch (error) {
            this.logger.error(`Error updating vehicle verification status ${id}:`, error);
            throw error;
        }
    }

    /**
     * Activate/Deactivate vehicle
     */
    async updateActiveStatus(id: string, isActive: boolean): Promise<VehicleResponseDto> {
        try {
            const vehicle = await this.vehiclesRepository.update(id, {
                is_active: isActive,
            });

            if (!vehicle) {
                throw new NotFoundException('Vehicle not found');
            }

            this.logger.log(`✅ Vehicle active status updated: ${id} -> ${isActive}`);
            return new VehicleResponseDto(vehicle);
        } catch (error) {
            this.logger.error(`Error updating vehicle active status ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get vehicle statistics
     */
    async getVehicleStats(driverId?: string): Promise<VehicleStatsDto> {
        try {
            const statusCounts = await this.vehiclesRepository.countVehiclesByStatus(driverId);

            // Get additional stats
            const vehicles = await this.vehiclesRepository.findMany(
                driverId ? { driver_id: driverId } : undefined
            );

            // Calculate vehicle stats
            const vehiclesByCategory: Record<string, number> = {};
            const vehiclesByMake: Record<string, number> = {};
            let totalYear = 0;
            let oldestYear = new Date().getFullYear();
            let newestYear = 1970;

            vehicles.forEach(vehicle => {
                // Category stats (would need vehicle class info)
                // For now, we'll skip this or use a default

                // Make stats
                if (vehicle.make) {
                    vehiclesByMake[vehicle.make] = (vehiclesByMake[vehicle.make] || 0) + 1;
                }

                // Year stats
                if (vehicle.year) {
                    totalYear += vehicle.year;
                    oldestYear = Math.min(oldestYear, vehicle.year);
                    newestYear = Math.max(newestYear, vehicle.year);
                }
            });

            const averageYear = vehicles.length > 0 ? Math.round(totalYear / vehicles.length) : 0;

            return new VehicleStatsDto({
                totalVehicles: statusCounts.total,
                activeVehicles: statusCounts.active,
                verifiedVehicles: statusCounts.verified,
                pendingVerification: statusCounts.pending,
                rejectedVehicles: statusCounts.rejected,
                vehiclesByCategory,
                vehiclesByMake,
                averageYear,
                oldestYear: vehicles.length > 0 ? oldestYear : 0,
                newestYear: vehicles.length > 0 ? newestYear : 0,
            });
        } catch (error) {
            this.logger.error('Error getting vehicle stats:', error);
            throw error;
        }
    }

    /**
     * Get driver vehicles summary
     */
    async getDriverVehiclesSummary(driverId: string): Promise<DriverVehiclesSummaryDto> {
        try {
            const vehicles = await this.findByDriverId(driverId);
            const activeVehicles = vehicles.filter(v => v.is_active);

            // Find primary vehicle (first verified and active vehicle)
            const primaryVehicle = vehicles.find(v =>
                v.is_active && v.verification_status === 'verified'
            ) || activeVehicles[0];

            return new DriverVehiclesSummaryDto({
                driverId,
                totalVehicles: vehicles.length,
                activeVehicles: activeVehicles.length,
                primaryVehicle,
                vehicles,
            });
        } catch (error) {
            this.logger.error(`Error getting driver vehicles summary for ${driverId}:`, error);
            throw error;
        }
    }

    /**
     * Search vehicles by plate number, make, or model
     */
    async searchVehicles(query: string): Promise<VehicleResponseDto[]> {
        try {
            // This is a simple implementation - in production you'd want full-text search
            const allVehicles = await this.vehiclesRepository.findMany();

            const searchTerm = query.toLowerCase();
            const filteredVehicles = allVehicles.filter(vehicle =>
                vehicle.plate_number?.toLowerCase().includes(searchTerm) ||
                vehicle.make?.toLowerCase().includes(searchTerm) ||
                vehicle.model?.toLowerCase().includes(searchTerm) ||
                vehicle.name?.toLowerCase().includes(searchTerm)
            );

            return filteredVehicles.map(vehicle => new VehicleResponseDto(vehicle));
        } catch (error) {
            this.logger.error('Error searching vehicles:', error);
            throw error;
        }
    }

    /**
     * Get vehicle by plate number
     */
    async findByPlateNumber(plateNumber: string): Promise<VehicleResponseDto | null> {
        try {
            const vehicle = await this.vehiclesRepository.findByPlateNumber(plateNumber);
            return vehicle ? new VehicleResponseDto(vehicle) : null;
        } catch (error) {
            this.logger.error(`Error finding vehicle by plate number ${plateNumber}:`, error);
            throw error;
        }
    }
}
