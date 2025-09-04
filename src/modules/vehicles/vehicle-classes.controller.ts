import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    HttpStatus,
    HttpException,
    Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VehicleClassesService } from './vehicle-classes.service';
import { CreateVehicleClassDto } from './dto/create-vehicle-class.dto';
import { UpdateVehicleClassDto } from './dto/update-vehicle-class.dto';
import { VehicleClassResponseDto } from './dto/vehicle-response.dto';

@Controller('api/vehicle-classes')
export class VehicleClassesController {
    private readonly logger = new Logger(VehicleClassesController.name);

    constructor(private readonly vehicleClassesService: VehicleClassesService) { }

    /**
     * Create a new vehicle class (admin only)
     */
    @Post()
    @UseGuards(AuthGuard('jwt'))
    async createVehicleClass(@Body() createVehicleClassDto: CreateVehicleClassDto): Promise<VehicleClassResponseDto> {
        try {
            const vehicleClass = await this.vehicleClassesService.create(createVehicleClassDto);
            return vehicleClass;
        } catch (error) {
            this.logger.error('Error creating vehicle class:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to create vehicle class', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get vehicle class by ID
     */
    @Get(':id')
    async getVehicleClassById(@Param('id') id: string): Promise<VehicleClassResponseDto> {
        try {
            const vehicleClass = await this.vehicleClassesService.findById(id);
            return vehicleClass;
        } catch (error) {
            this.logger.error(`Error getting vehicle class ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to get vehicle class', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get all vehicle classes
     */
    @Get()
    async getAllVehicleClasses(
        @Query('category') category?: string,
        @Query('is_active') isActive?: string,
    ): Promise<VehicleClassResponseDto[]> {
        try {
            const filters: any = {};

            if (category) filters.category = category;
            if (isActive !== undefined) filters.is_active = isActive === 'true';

            const vehicleClasses = await this.vehicleClassesService.findAll(filters);
            return vehicleClasses;
        } catch (error) {
            this.logger.error('Error getting all vehicle classes:', error);
            throw new HttpException('Failed to get vehicle classes', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get active vehicle classes
     */
    @Get('active/list')
    async getActiveVehicleClasses(): Promise<VehicleClassResponseDto[]> {
        try {
            const vehicleClasses = await this.vehicleClassesService.findActive();
            return vehicleClasses;
        } catch (error) {
            this.logger.error('Error getting active vehicle classes:', error);
            throw new HttpException('Failed to get active vehicle classes', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get vehicle classes by category
     */
    @Get('category/:category')
    async getVehicleClassesByCategory(@Param('category') category: string): Promise<VehicleClassResponseDto[]> {
        try {
            const vehicleClasses = await this.vehicleClassesService.findByCategory(category);
            return vehicleClasses;
        } catch (error) {
            this.logger.error(`Error getting vehicle classes for category ${category}:`, error);
            throw new HttpException('Failed to get vehicle classes', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Update vehicle class (admin only)
     */
    @Put(':id')
    @UseGuards(AuthGuard('jwt'))
    async updateVehicleClass(
        @Param('id') id: string,
        @Body() updateVehicleClassDto: UpdateVehicleClassDto,
    ): Promise<VehicleClassResponseDto> {
        try {
            const vehicleClass = await this.vehicleClassesService.update(id, updateVehicleClassDto);
            return vehicleClass;
        } catch (error) {
            this.logger.error(`Error updating vehicle class ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to update vehicle class', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Delete vehicle class (admin only)
     */
    @Delete(':id')
    @UseGuards(AuthGuard('jwt'))
    async deleteVehicleClass(@Param('id') id: string): Promise<{ success: boolean }> {
        try {
            const success = await this.vehicleClassesService.delete(id);
            return { success };
        } catch (error) {
            this.logger.error(`Error deleting vehicle class ${id}:`, error);
            throw new HttpException('Failed to delete vehicle class', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get available vehicle categories
     */
    @Get('categories/list')
    async getVehicleCategories(): Promise<{ categories: string[] }> {
        try {
            const categories = await this.vehicleClassesService.getCategories();
            return { categories };
        } catch (error) {
            this.logger.error('Error getting vehicle categories:', error);
            throw new HttpException('Failed to get vehicle categories', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
