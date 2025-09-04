import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateVehicleClassDto } from './dto/create-vehicle-class.dto';
import { UpdateVehicleClassDto } from './dto/update-vehicle-class.dto';
import { VehicleClassResponseDto } from './dto/vehicle-response.dto';

@Injectable()
export class VehicleClassesService {
    private readonly logger = new Logger(VehicleClassesService.name);

    constructor(private readonly databaseService: DatabaseService) { }

    /**
     * Create a new vehicle class
     */
    async create(createVehicleClassDto: CreateVehicleClassDto): Promise<VehicleClassResponseDto> {
        try {
            // Check if name already exists
            const existingClass = await this.findByName(createVehicleClassDto.name);
            if (existingClass) {
                throw new ConflictException('A vehicle class with this name already exists');
            }

            const { data: vehicleClass, error } = await this.databaseService.client
                .from('vehicle_classes')
                .insert([{
                    ...createVehicleClassDto,
                    is_active: createVehicleClassDto.is_active ?? true,
                }])
                .select()
                .single();

            if (error) {
                this.logger.error('Failed to create vehicle class:', error);
                throw error;
            }

            this.logger.log(`✅ Vehicle class created successfully: ${vehicleClass.id}`);
            return new VehicleClassResponseDto(vehicleClass);
        } catch (error) {
            this.logger.error('Error creating vehicle class:', error);
            throw error;
        }
    }

    /**
     * Get vehicle class by ID
     */
    async findById(id: string): Promise<VehicleClassResponseDto> {
        try {
            const { data, error } = await this.databaseService.client
                .from('vehicle_classes')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find vehicle class by ID ${id}:`, error);
                throw error;
            }

            if (!data) {
                throw new NotFoundException('Vehicle class not found');
            }

            return new VehicleClassResponseDto(data);
        } catch (error) {
            this.logger.error(`Error finding vehicle class ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get vehicle class by name
     */
    async findByName(name: string): Promise<VehicleClassResponseDto | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('vehicle_classes')
                .select('*')
                .eq('name', name)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find vehicle class by name ${name}:`, error);
                throw error;
            }

            return data ? new VehicleClassResponseDto(data) : null;
        } catch (error) {
            this.logger.error(`Error finding vehicle class by name ${name}:`, error);
            throw error;
        }
    }

    /**
     * Get all vehicle classes
     */
    async findAll(filters?: { category?: string; is_active?: boolean }): Promise<VehicleClassResponseDto[]> {
        try {
            let query = this.databaseService.client.from('vehicle_classes').select('*');

            if (filters) {
                if (filters.category) {
                    query = query.eq('category', filters.category);
                }
                if (filters.is_active !== undefined) {
                    query = query.eq('is_active', filters.is_active);
                }
            }

            const { data, error } = await query.order('name');

            if (error) {
                this.logger.error('Failed to find vehicle classes:', error);
                throw error;
            }

            return (data || []).map(item => new VehicleClassResponseDto(item));
        } catch (error) {
            this.logger.error('Error finding vehicle classes:', error);
            throw error;
        }
    }

    /**
     * Get active vehicle classes
     */
    async findActive(): Promise<VehicleClassResponseDto[]> {
        return this.findAll({ is_active: true });
    }

    /**
     * Get vehicle classes by category
     */
    async findByCategory(category: string): Promise<VehicleClassResponseDto[]> {
        return this.findAll({ category, is_active: true });
    }

    /**
     * Update vehicle class
     */
    async update(id: string, updateVehicleClassDto: UpdateVehicleClassDto): Promise<VehicleClassResponseDto> {
        try {
            // Check if name is being updated and if it conflicts
            if (updateVehicleClassDto.name) {
                const existingClass = await this.findByName(updateVehicleClassDto.name);
                if (existingClass && existingClass.id !== id) {
                    throw new ConflictException('A vehicle class with this name already exists');
                }
            }

            const { data: vehicleClass, error } = await this.databaseService.client
                .from('vehicle_classes')
                .update(updateVehicleClassDto)
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to update vehicle class ${id}:`, error);
                throw error;
            }

            if (!vehicleClass) {
                throw new NotFoundException('Vehicle class not found');
            }

            this.logger.log(`✅ Vehicle class updated successfully: ${id}`);
            return new VehicleClassResponseDto(vehicleClass);
        } catch (error) {
            this.logger.error(`Error updating vehicle class ${id}:`, error);
            throw error;
        }
    }

    /**
     * Delete vehicle class (soft delete)
     */
    async delete(id: string): Promise<boolean> {
        try {
            const { data, error } = await this.databaseService.client
                .from('vehicle_classes')
                .update({ is_active: false })
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to delete vehicle class ${id}:`, error);
                throw error;
            }

            const success = !!data;
            if (success) {
                this.logger.log(`✅ Vehicle class soft deleted successfully: ${id}`);
            }

            return success;
        } catch (error) {
            this.logger.error(`Error deleting vehicle class ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get vehicle class categories
     */
    async getCategories(): Promise<string[]> {
        try {
            const { data, error } = await this.databaseService.client
                .from('vehicle_classes')
                .select('category')
                .eq('is_active', true);

            if (error) {
                this.logger.error('Failed to get vehicle class categories:', error);
                throw error;
            }

            const categories = [...new Set(data?.map(item => item.category) || [])];
            return categories.sort();
        } catch (error) {
            this.logger.error('Error getting vehicle class categories:', error);
            throw error;
        }
    }
}
