import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { VehicleTypesPostgresService } from './vehicle-types-postgres.service';

@Controller('api/vehicle-types')
export class VehicleTypesController {
    private readonly logger = new Logger(VehicleTypesController.name);

    constructor(private readonly vehicleTypesService: VehicleTypesPostgresService) { }

    /**
     * Get all active vehicle types
     * GET /api/vehicle-types
     */
    @Get()
    async findAll(@Query('category') category?: string) {
        try {
            this.logger.log('📋 Fetching vehicle types');
            
            let vehicleTypes;
            if (category) {
                vehicleTypes = await this.vehicleTypesService.findByCategory(category);
            } else {
                vehicleTypes = await this.vehicleTypesService.findActive();
            }

            this.logger.log(`✅ Found ${vehicleTypes.length} vehicle types`);
            return {
                success: true,
                data: vehicleTypes,
                count: vehicleTypes.length
            };
        } catch (error) {
            this.logger.error('❌ Error fetching vehicle types:', error);
            throw error;
        }
    }

    /**
     * Get vehicle type by ID
     * GET /api/vehicle-types/:id
     */
    @Get(':id')
    async findById(@Param('id') id: string) {
        try {
            const vehicleTypeId = parseInt(id, 10);
            if (isNaN(vehicleTypeId)) {
                throw new Error('Invalid vehicle type ID');
            }

            this.logger.log(`📋 Fetching vehicle type: ${vehicleTypeId}`);
            
            const vehicleType = await this.vehicleTypesService.findById(vehicleTypeId);
            
            if (!vehicleType) {
                return {
                    success: false,
                    message: 'Vehicle type not found'
                };
            }

            this.logger.log(`✅ Found vehicle type: ${vehicleType.display_name}`);
            return {
                success: true,
                data: vehicleType
            };
        } catch (error) {
            this.logger.error(`❌ Error fetching vehicle type ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get vehicle type categories
     * GET /api/vehicle-types/categories
     */
    @Get('categories')
    async getCategories() {
        try {
            this.logger.log('📋 Fetching vehicle type categories');
            
            const categories = await this.vehicleTypesService.getCategories();

            this.logger.log(`✅ Found ${categories.length} categories`);
            return {
                success: true,
                data: categories,
                count: categories.length
            };
        } catch (error) {
            this.logger.error('❌ Error fetching vehicle type categories:', error);
            throw error;
        }
    }
}
