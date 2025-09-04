import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DriverProfilesRepository } from '../database/repositories/driver-profiles.repository';
import { UsersRepository } from '../database/repositories/users.repository';
import { VehiclesRepository } from '../database/repositories/vehicles.repository';
import { DocumentsRepository } from '../database/repositories/documents.repository';
import { CreateDriverProfileDto } from './dto/create-driver-profile.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { DriverProfileResponseDto, DriverRegistrationProgressDto, DriverStatsDto } from './dto/driver-profile-response.dto';
import { DriverProfile } from '../database/entities/driver-profile.entity';

@Injectable()
export class DriverProfilesService {
  private readonly logger = new Logger(DriverProfilesService.name);

  constructor(
    private readonly driverProfilesRepository: DriverProfilesRepository,
    private readonly usersRepository: UsersRepository,
    private readonly vehiclesRepository: VehiclesRepository,
    private readonly documentsRepository: DocumentsRepository,
  ) { }

  /**
   * Create a new driver profile
   */
  async create(createDriverProfileDto: CreateDriverProfileDto): Promise<DriverProfileResponseDto> {
    try {
      // Verify user exists
      const user = await this.usersRepository.findById(createDriverProfileDto.user_id);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check if profile already exists for this user
      const existingProfile = await this.driverProfilesRepository.findByUserId(createDriverProfileDto.user_id);
      if (existingProfile) {
        throw new BadRequestException('Driver profile already exists for this user');
      }

      // Create the profile
      const profile = await this.driverProfilesRepository.create(createDriverProfileDto);

      this.logger.log(`✅ Driver profile created successfully: ${profile.id}`);
      return new DriverProfileResponseDto(profile);
    } catch (error) {
      this.logger.error('Error creating driver profile:', error);
      throw error;
    }
  }

  /**
   * Get driver profile by ID
   */
  async findById(id: string): Promise<DriverProfileResponseDto> {
    try {
      const profile = await this.driverProfilesRepository.findById(id);
      if (!profile) {
        throw new NotFoundException('Driver profile not found');
      }
      return new DriverProfileResponseDto(profile);
    } catch (error) {
      this.logger.error(`Error finding driver profile ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get driver profile by user ID
   */
  async findByUserId(userId: string): Promise<DriverProfileResponseDto | null> {
    try {
      const profile = await this.driverProfilesRepository.findByUserId(userId);
      return profile ? new DriverProfileResponseDto(profile) : null;
    } catch (error) {
      this.logger.error(`Error finding driver profile for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get all driver profiles with optional filters
   */
  async findAll(filters?: Partial<DriverProfile>): Promise<DriverProfileResponseDto[]> {
    try {
      const profiles = await this.driverProfilesRepository.findMany(filters);
      return profiles.map(profile => new DriverProfileResponseDto(profile));
    } catch (error) {
      this.logger.error('Error finding driver profiles:', error);
      throw error;
    }
  }

  /**
   * Update driver profile
   */
  async update(id: string, updateDriverProfileDto: UpdateDriverProfileDto): Promise<DriverProfileResponseDto> {
    try {
      const profile = await this.driverProfilesRepository.update(id, updateDriverProfileDto);
      if (!profile) {
        throw new NotFoundException('Driver profile not found');
      }

      this.logger.log(`✅ Driver profile updated successfully: ${id}`);
      return new DriverProfileResponseDto(profile);
    } catch (error) {
      this.logger.error(`Error updating driver profile ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update driver profile by user ID
   */
  async updateByUserId(userId: string, updateDriverProfileDto: UpdateDriverProfileDto): Promise<DriverProfileResponseDto> {
    try {
      const profile = await this.driverProfilesRepository.findByUserId(userId);
      if (!profile) {
        throw new NotFoundException('Driver profile not found');
      }

      return await this.update(profile.id, updateDriverProfileDto);
    } catch (error) {
      this.logger.error(`Error updating driver profile for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Delete driver profile (soft delete)
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.driverProfilesRepository.delete(id);
      if (result) {
        this.logger.log(`✅ Driver profile deleted successfully: ${id}`);
      }
      return result;
    } catch (error) {
      this.logger.error(`Error deleting driver profile ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get driver registration progress
   */
  async getRegistrationProgress(userId: string): Promise<DriverRegistrationProgressDto> {
    try {
      const profile = await this.driverProfilesRepository.findByUserId(userId);
      const vehicles = await this.vehiclesRepository.findMany({ driver_id: profile?.id });
      const documents = await this.documentsRepository.findMany({ user_id: userId });

      const hasProfile = !!profile;
      const hasVehicle = vehicles.length > 0;
      const hasDocuments = documents.length > 0;

      // Calculate completion percentage
      let completionPercentage = 0;
      if (hasProfile) completionPercentage += 40;
      if (hasVehicle) completionPercentage += 30;
      if (hasDocuments) completionPercentage += 30;

      // Determine next step
      let nextStep = 'register-1';
      if (!hasProfile) {
        nextStep = 'create-profile';
      } else if (!hasVehicle) {
        nextStep = 'add-vehicle';
      } else if (!hasDocuments) {
        nextStep = 'upload-documents';
      } else {
        nextStep = 'verification';
      }

      // Check verification status
      const verificationStatus = profile?.verification_status || 'unverified';

      // Determine if registration is complete
      const isComplete = hasProfile && hasVehicle && hasDocuments && verificationStatus === 'verified';

      // Identify missing fields
      const missingFields: string[] = [];
      if (!hasProfile) missingFields.push('driver_profile');
      if (!hasVehicle) missingFields.push('vehicle');
      if (!hasDocuments) missingFields.push('documents');
      if (verificationStatus !== 'verified') missingFields.push('verification');

      return new DriverRegistrationProgressDto({
        hasProfile,
        hasVehicle,
        hasDocuments,
        isComplete,
        verificationStatus,
        nextStep,
        completionPercentage,
        missingFields,
      });
    } catch (error) {
      this.logger.error(`Error getting registration progress for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get driver statistics
   */
  async getDriverStats(userId: string): Promise<DriverStatsDto> {
    try {
      const profile = await this.driverProfilesRepository.findByUserId(userId);
      if (!profile) {
        throw new NotFoundException('Driver profile not found');
      }

      return new DriverStatsDto({
        totalTrips: profile.total_trips,
        totalEarnings: profile.total_earnings_cents,
        averageRating: profile.rating_avg,
        ratingCount: profile.rating_count,
        yearsOfExperience: profile.years_of_experience,
        isOnline: profile.is_online,
        isAvailable: profile.is_available,
        lastActiveAt: profile.updated_at,
      });
    } catch (error) {
      this.logger.error(`Error getting driver stats for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update driver availability status
   */
  async updateAvailability(userId: string, isAvailable: boolean, isOnline: boolean): Promise<DriverProfileResponseDto> {
    try {
      const profile = await this.driverProfilesRepository.findByUserId(userId);
      if (!profile) {
        throw new NotFoundException('Driver profile not found');
      }

      const updatedProfile = await this.driverProfilesRepository.update(profile.id, {
        is_available: isAvailable,
        is_online: isOnline,
      });

      if (!updatedProfile) {
        throw new Error('Failed to update driver availability');
      }

      this.logger.log(`✅ Driver availability updated for user ${userId}: available=${isAvailable}, online=${isOnline}`);
      return new DriverProfileResponseDto(updatedProfile);
    } catch (error) {
      this.logger.error(`Error updating driver availability for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update driver rating
   */
  async updateRating(userId: string, newRating: number): Promise<DriverProfileResponseDto> {
    try {
      const profile = await this.driverProfilesRepository.findByUserId(userId);
      if (!profile) {
        throw new NotFoundException('Driver profile not found');
      }

      if (newRating < 1 || newRating > 5) {
        throw new BadRequestException('Rating must be between 1 and 5');
      }

      // Calculate new average rating
      const currentTotal = profile.rating_avg * profile.rating_count;
      const newTotal = currentTotal + newRating;
      const newCount = profile.rating_count + 1;
      const newAverage = newTotal / newCount;

      const updatedProfile = await this.driverProfilesRepository.update(profile.id, {
        rating_avg: Math.round(newAverage * 100) / 100, // Round to 2 decimal places
        rating_count: newCount,
      });

      if (!updatedProfile) {
        throw new Error('Failed to update driver rating');
      }

      this.logger.log(`✅ Driver rating updated for user ${userId}: new average=${newAverage}`);
      return new DriverProfileResponseDto(updatedProfile);
    } catch (error) {
      this.logger.error(`Error updating driver rating for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Increment trip count and earnings
   */
  async incrementTripStats(userId: string, tripEarningsCents: number): Promise<void> {
    try {
      const profile = await this.driverProfilesRepository.findByUserId(userId);
      if (!profile) {
        throw new NotFoundException('Driver profile not found');
      }

      await this.driverProfilesRepository.update(profile.id, {
        total_trips: profile.total_trips + 1,
        total_earnings_cents: profile.total_earnings_cents + tripEarningsCents,
      });

      this.logger.log(`✅ Trip stats updated for user ${userId}: trips=${profile.total_trips + 1}, earnings=${profile.total_earnings_cents + tripEarningsCents}`);
    } catch (error) {
      this.logger.error(`Error updating trip stats for user ${userId}:`, error);
      throw error;
    }
  }
}
