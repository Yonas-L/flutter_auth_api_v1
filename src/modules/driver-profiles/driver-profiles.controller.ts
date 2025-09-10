import {
  Controller,
  Get,
  Post,
  Put,
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
import { DriverProfilesService } from './driver-profiles.service';
import { CreateDriverProfileDto } from './dto/create-driver-profile.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { DriverProfileResponseDto, DriverRegistrationProgressDto, DriverStatsDto } from './dto/driver-profile-response.dto';

@Controller('api/driver-profiles')
export class DriverProfilesController {
  private readonly logger = new Logger(DriverProfilesController.name);

  constructor(private readonly driverProfilesService: DriverProfilesService) { }

  /**
   * Create a new driver profile
   */
  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createDriverProfile(
    @Request() req: any,
    @Body() createDriverProfileDto: CreateDriverProfileDto,
  ): Promise<DriverProfileResponseDto> {
    try {
      // Ensure the user can only create a profile for themselves
      if (createDriverProfileDto.user_id !== req.user.id) {
        throw new HttpException('You can only create a profile for yourself', HttpStatus.FORBIDDEN);
      }

      const profile = await this.driverProfilesService.create(createDriverProfileDto);
      return profile;
    } catch (error) {
      this.logger.error('Error creating driver profile:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to create driver profile', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get current driver profile (requires authentication)
   */
  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  async getCurrentDriverProfile(@Request() req: any): Promise<DriverProfileResponseDto> {
    try {
      const userId = req.user.id;
      const profile = await this.driverProfilesService.findByUserId(userId);

      if (!profile) {
        throw new HttpException('Driver profile not found', HttpStatus.NOT_FOUND);
      }

      return profile;
    } catch (error) {
      this.logger.error('Error getting current driver profile:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get driver profile', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get driver verification status (requires authentication)
   */
  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  async getDriverStatus(@Request() req: any): Promise<{ verification_status: string }> {
    try {
      const userId = req.user.id;
      const profile = await this.driverProfilesService.findByUserId(userId);

      if (!profile) {
        throw new HttpException('Driver profile not found', HttpStatus.NOT_FOUND);
      }

      return {
        verification_status: profile.verification_status || 'unverified'
      };
    } catch (error) {
      this.logger.error('Error getting driver status:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get driver status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Update current driver profile (requires authentication)
   */
  @Put('profile')
  @UseGuards(AuthGuard('jwt'))
  async updateCurrentDriverProfile(
    @Request() req: any,
    @Body() updateDriverProfileDto: UpdateDriverProfileDto,
  ): Promise<DriverProfileResponseDto> {
    try {
      const userId = req.user.id;
      const updatedProfile = await this.driverProfilesService.updateByUserId(userId, updateDriverProfileDto);
      return updatedProfile;
    } catch (error) {
      this.logger.error('Error updating current driver profile:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to update driver profile', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get driver profile by ID (admin use)
   */
  @Get(':id')
  async getDriverProfileById(@Param('id') id: string): Promise<DriverProfileResponseDto> {
    try {
      const profile = await this.driverProfilesService.findById(id);
      return profile;
    } catch (error) {
      this.logger.error(`Error getting driver profile ${id}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get driver profile', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get driver profile by user ID
   */
  @Get('user/:userId')
  async getDriverProfileByUserId(@Param('userId') userId: string): Promise<DriverProfileResponseDto | null> {
    try {
      const profile = await this.driverProfilesService.findByUserId(userId);
      return profile;
    } catch (error) {
      this.logger.error(`Error getting driver profile for user ${userId}:`, error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get driver profile', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get all driver profiles with optional filters (admin use)
   */
  @Get()
  async getAllDriverProfiles(
    @Query('verification_status') verificationStatus?: string,
    @Query('is_available') isAvailable?: string,
    @Query('is_online') isOnline?: string,
    @Query('city') city?: string,
  ): Promise<DriverProfileResponseDto[]> {
    try {
      const filters: any = {};

      if (verificationStatus) {
        filters.verification_status = verificationStatus;
      }
      if (isAvailable !== undefined) {
        filters.is_available = isAvailable === 'true';
      }
      if (isOnline !== undefined) {
        filters.is_online = isOnline === 'true';
      }
      if (city) {
        filters.city = city;
      }

      const profiles = await this.driverProfilesService.findAll(filters);
      return profiles;
    } catch (error) {
      this.logger.error('Error getting all driver profiles:', error);
      throw new HttpException('Failed to get driver profiles', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }


  /**
   * Get driver statistics (requires authentication)
   */
  @Get('stats/summary')
  @UseGuards(AuthGuard('jwt'))
  async getDriverStats(@Request() req: any): Promise<DriverStatsDto> {
    try {
      const userId = req.user.id;
      const stats = await this.driverProfilesService.getDriverStats(userId);
      return stats;
    } catch (error) {
      this.logger.error('Error getting driver stats:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get driver stats', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Update driver availability status (requires authentication)
   */
  @Put('availability')
  @UseGuards(AuthGuard('jwt'))
  async updateDriverAvailability(
    @Request() req: any,
    @Body() body: { is_available: boolean; is_online: boolean },
  ): Promise<DriverProfileResponseDto> {
    try {
      const userId = req.user.id;
      const { is_available, is_online } = body;

      if (typeof is_available !== 'boolean' || typeof is_online !== 'boolean') {
        throw new HttpException('is_available and is_online must be boolean values', HttpStatus.BAD_REQUEST);
      }

      const updatedProfile = await this.driverProfilesService.updateAvailability(userId, is_available, is_online);
      return updatedProfile;
    } catch (error) {
      this.logger.error('Error updating driver availability:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to update driver availability', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Update driver rating (requires authentication)
   */
  @Put('rating')
  @UseGuards(AuthGuard('jwt'))
  async updateDriverRating(
    @Request() req: any,
    @Body() body: { rating: number },
  ): Promise<DriverProfileResponseDto> {
    try {
      const userId = req.user.id;
      const { rating } = body;

      if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        throw new HttpException('Rating must be a number between 1 and 5', HttpStatus.BAD_REQUEST);
      }

      const updatedProfile = await this.driverProfilesService.updateRating(userId, rating);
      return updatedProfile;
    } catch (error) {
      this.logger.error('Error updating driver rating:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to update driver rating', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Search drivers by name or city
   */
  @Get('search')
  async searchDrivers(
    @Query('q') query?: string,
    @Query('city') city?: string,
    @Query('verification_status') verificationStatus?: string,
  ): Promise<DriverProfileResponseDto[]> {
    try {
      // This is a placeholder - will be implemented with proper search logic
      // For now, return empty array
      return [];
    } catch (error) {
      this.logger.error('Error searching drivers:', error);
      throw new HttpException('Failed to search drivers', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get online drivers in a specific city
   */
  @Get('online/:city')
  async getOnlineDriversInCity(@Param('city') city: string): Promise<DriverProfileResponseDto[]> {
    try {
      const profiles = await this.driverProfilesService.findAll({
        city: city,
        is_online: true,
        is_available: true,
      });
      return profiles;
    } catch (error) {
      this.logger.error(`Error getting online drivers in ${city}:`, error);
      throw new HttpException('Failed to get online drivers', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get driver profile completion status
   */
  @Get('completion/:userId')
  async getDriverProfileCompletion(@Param('userId') userId: string): Promise<{ isComplete: boolean; missingFields: string[] }> {
    try {
      const progress = await this.driverProfilesService.getRegistrationProgress(userId);
      return {
        isComplete: progress.isComplete,
        missingFields: progress.missingFields,
      };
    } catch (error) {
      this.logger.error(`Error getting driver profile completion for user ${userId}:`, error);
      throw new HttpException('Failed to get profile completion status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
