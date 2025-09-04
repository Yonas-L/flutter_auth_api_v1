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
    Request,
    HttpStatus,
    HttpException,
    Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleResponseDto, VehicleStatsDto, DriverVehiclesSummaryDto } from './dto/vehicle-response.dto';

@Controller('api/vehicles')
export class VehiclesController {
    private readonly logger = new Logger(VehiclesController.name);

    constructor(private readonly vehiclesService: VehiclesService) { }

    /**
     * Create a new vehicle
     */
    @Post()
    @UseGuards(AuthGuard('jwt'))
    async createVehicle(
        @Request() req: any,
        @Body() createVehicleDto: CreateVehicleDto,
    ): Promise<VehicleResponseDto> {
        try {
            const vehicle = await this.vehiclesService.create(createVehicleDto);
            return vehicle;
        } catch (error) {
            this.logger.error('Error creating vehicle:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to create vehicle', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get current driver's vehicles
     */
    @Get('my-vehicles')
    @UseGuards(AuthGuard('jwt'))
    async getCurrentDriverVehicles(@Request() req: any): Promise<VehicleResponseDto[]> {
        try {
            const userId = req.user.id;

            // First, we need to get the driver profile to get the driver_id
            // For now, we'll assume the user can pass driver_id in query param
            // This should be improved to automatically resolve from user context
            const vehicles = await this.vehiclesService.findByDriverId(userId);
            return vehicles;
        } catch (error) {
            this.logger.error('Error getting current driver vehicles:', error);
            throw new HttpException('Failed to get vehicles', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get current driver's vehicle summary
     */
    @Get('my-vehicles/summary')
    @UseGuards(AuthGuard('jwt'))
    async getCurrentDriverVehiclesSummary(@Request() req: any): Promise<DriverVehiclesSummaryDto> {
        try {
            const userId = req.user.id;
            const summary = await this.vehiclesService.getDriverVehiclesSummary(userId);
            return summary;
        } catch (error) {
            this.logger.error('Error getting driver vehicles summary:', error);
            throw new HttpException('Failed to get vehicles summary', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Search vehicles
     */
    @Get('search')
    async searchVehicles(@Query('q') query?: string): Promise<VehicleResponseDto[]> {
        try {
            if (!query || query.trim().length < 2) {
                throw new HttpException('Search query must be at least 2 characters', HttpStatus.BAD_REQUEST);
            }

            const vehicles = await this.vehiclesService.searchVehicles(query.trim());
            return vehicles;
        } catch (error) {
            this.logger.error('Error searching vehicles:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to search vehicles', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get vehicle by ID
     */
    @Get(':id')
    async getVehicleById(@Param('id') id: string): Promise<VehicleResponseDto> {
        try {
            const vehicle = await this.vehiclesService.findById(id);
            return vehicle;
        } catch (error) {
            this.logger.error(`Error getting vehicle ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to get vehicle', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get vehicle by ID with class information
     */
    @Get(':id/with-class')
    async getVehicleByIdWithClass(@Param('id') id: string): Promise<VehicleResponseDto> {
        try {
            const vehicle = await this.vehiclesService.findByIdWithClass(id);
            return vehicle;
        } catch (error) {
            this.logger.error(`Error getting vehicle with class ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to get vehicle', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get all vehicles with optional filters
     */
    @Get()
    async getAllVehicles(
        @Query('driver_id') driverId?: string,
        @Query('verification_status') verificationStatus?: string,
        @Query('is_active') isActive?: string,
        @Query('make') make?: string,
        @Query('year') year?: string,
    ): Promise<VehicleResponseDto[]> {
        try {
            const filters: any = {};

            if (driverId) filters.driver_id = driverId;
            if (verificationStatus) filters.verification_status = verificationStatus;
            if (isActive !== undefined) filters.is_active = isActive === 'true';
            if (make) filters.make = make;
            if (year) filters.year = parseInt(year);

            const vehicles = await this.vehiclesService.findAll(filters);
            return vehicles;
        } catch (error) {
            this.logger.error('Error getting all vehicles:', error);
            throw new HttpException('Failed to get vehicles', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get vehicles by driver ID
     */
    @Get('driver/:driverId')
    async getVehiclesByDriverId(@Param('driverId') driverId: string): Promise<VehicleResponseDto[]> {
        try {
            const vehicles = await this.vehiclesService.findByDriverId(driverId);
            return vehicles;
        } catch (error) {
            this.logger.error(`Error getting vehicles for driver ${driverId}:`, error);
            throw new HttpException('Failed to get vehicles', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get active vehicles by driver ID
     */
    @Get('driver/:driverId/active')
    async getActiveVehiclesByDriverId(@Param('driverId') driverId: string): Promise<VehicleResponseDto[]> {
        try {
            const vehicles = await this.vehiclesService.findActiveByDriverId(driverId);
            return vehicles;
        } catch (error) {
            this.logger.error(`Error getting active vehicles for driver ${driverId}:`, error);
            throw new HttpException('Failed to get active vehicles', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get verified vehicles by driver ID
     */
    @Get('driver/:driverId/verified')
    async getVerifiedVehiclesByDriverId(@Param('driverId') driverId: string): Promise<VehicleResponseDto[]> {
        try {
            const vehicles = await this.vehiclesService.findVerifiedByDriverId(driverId);
            return vehicles;
        } catch (error) {
            this.logger.error(`Error getting verified vehicles for driver ${driverId}:`, error);
            throw new HttpException('Failed to get verified vehicles', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Update vehicle
     */
    @Put(':id')
    @UseGuards(AuthGuard('jwt'))
    async updateVehicle(
        @Param('id') id: string,
        @Body() updateVehicleDto: UpdateVehicleDto,
    ): Promise<VehicleResponseDto> {
        try {
            const vehicle = await this.vehiclesService.update(id, updateVehicleDto);
            return vehicle;
        } catch (error) {
            this.logger.error(`Error updating vehicle ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to update vehicle', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Delete vehicle (soft delete)
     */
    @Delete(':id')
    @UseGuards(AuthGuard('jwt'))
    async deleteVehicle(@Param('id') id: string): Promise<{ success: boolean }> {
        try {
            const success = await this.vehiclesService.delete(id);
            return { success };
        } catch (error) {
            this.logger.error(`Error deleting vehicle ${id}:`, error);
            throw new HttpException('Failed to delete vehicle', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Update vehicle verification status
     */
    @Put(':id/verification-status')
    @UseGuards(AuthGuard('jwt'))
    async updateVehicleVerificationStatus(
        @Param('id') id: string,
        @Body() body: { status: 'pending_review' | 'verified' | 'rejected' },
    ): Promise<VehicleResponseDto> {
        try {
            const { status } = body;

            if (!status || !['pending_review', 'verified', 'rejected'].includes(status)) {
                throw new HttpException('Invalid verification status', HttpStatus.BAD_REQUEST);
            }

            const vehicle = await this.vehiclesService.updateVerificationStatus(id, status);
            return vehicle;
        } catch (error) {
            this.logger.error(`Error updating vehicle verification status ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to update verification status', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Update vehicle active status
     */
    @Put(':id/active-status')
    @UseGuards(AuthGuard('jwt'))
    async updateVehicleActiveStatus(
        @Param('id') id: string,
        @Body() body: { is_active: boolean },
    ): Promise<VehicleResponseDto> {
        try {
            const { is_active } = body;

            if (typeof is_active !== 'boolean') {
                throw new HttpException('is_active must be a boolean value', HttpStatus.BAD_REQUEST);
            }

            const vehicle = await this.vehiclesService.updateActiveStatus(id, is_active);
            return vehicle;
        } catch (error) {
            this.logger.error(`Error updating vehicle active status ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to update active status', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get vehicle statistics
     */
    @Get('stats/summary')
    async getVehicleStats(
        @Query('driver_id') driverId?: string,
    ): Promise<VehicleStatsDto> {
        try {
            const stats = await this.vehiclesService.getVehicleStats(driverId);
            return stats;
        } catch (error) {
            this.logger.error('Error getting vehicle stats:', error);
            throw new HttpException('Failed to get vehicle stats', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get vehicle by plate number
     */
    @Get('plate/:plateNumber')
    async getVehicleByPlateNumber(@Param('plateNumber') plateNumber: string): Promise<VehicleResponseDto | null> {
        try {
            const vehicle = await this.vehiclesService.findByPlateNumber(plateNumber);
            return vehicle;
        } catch (error) {
            this.logger.error(`Error getting vehicle by plate number ${plateNumber}:`, error);
            throw new HttpException('Failed to get vehicle', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Check if plate number is available
     */
    @Get('plate/:plateNumber/available')
    async checkPlateNumberAvailable(@Param('plateNumber') plateNumber: string): Promise<{ available: boolean }> {
        try {
            const vehicle = await this.vehiclesService.findByPlateNumber(plateNumber);
            return { available: !vehicle };
        } catch (error) {
            this.logger.error(`Error checking plate number availability ${plateNumber}:`, error);
            throw new HttpException('Failed to check plate number availability', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
