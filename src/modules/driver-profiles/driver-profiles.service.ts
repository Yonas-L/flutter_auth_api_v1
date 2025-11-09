import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DriverProfilesPostgresRepository } from '../database/repositories/driver-profiles-postgres.repository';
import { UsersRepository } from '../database/repositories/users.repository';
import { VehiclesPostgresRepository } from '../database/repositories/vehicles-postgres.repository';
import { DocumentsRepository } from '../database/repositories/documents.repository';
import { CreateDriverProfileDto } from './dto/create-driver-profile.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { DriverProfileResponseDto, DriverRegistrationProgressDto, DriverStatsDto, DriverDashboardStatsDto } from './dto/driver-profile-response.dto';
import { DriverProfile } from '../database/entities/driver-profile.entity';
import { PostgresService } from '../database/postgres.service';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class DriverProfilesService {
  private readonly logger = new Logger(DriverProfilesService.name);

  constructor(
    private readonly driverProfilesRepository: DriverProfilesPostgresRepository,
    private readonly usersRepository: UsersRepository,
    private readonly vehiclesRepository: VehiclesPostgresRepository,
    private readonly documentsRepository: DocumentsRepository,
    private readonly postgresService: PostgresService,
    private readonly walletService: WalletService,
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
      this.logger.log(`🔍 Getting registration progress for user: ${userId}`);

      this.logger.log(`🔍 Fetching driver profile for user: ${userId}`);
      const profile = await this.driverProfilesRepository.findByUserId(userId);
      this.logger.log(`🔍 Profile found: ${!!profile}, ID: ${profile?.id}`);

      // Only fetch vehicles if we have a driver profile
      let vehicles: any[] = [];
      if (profile?.id) {
        this.logger.log(`🔍 Fetching vehicles for driver: ${profile.id}`);
        vehicles = await this.vehiclesRepository.findMany({ driver_id: profile.id });
        this.logger.log(`🔍 Vehicles found: ${vehicles.length}`);
      } else {
        this.logger.log(`🔍 No driver profile found, skipping vehicle check`);
      }

      this.logger.log(`🔍 Fetching documents for user: ${userId}`);
      const documents = await this.documentsRepository.findMany({ user_id: userId });
      this.logger.log(`🔍 Documents found: ${documents.length}`);

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

      // Determine if registration is complete (all steps filled, regardless of verification)
      const isComplete = hasProfile && hasVehicle && hasDocuments;

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

      // Calculate new earnings with safety check to prevent BigInt overflow
      const MAX_SAFE_EARNINGS = 9000000000000000000; // 9 * 10^18 (much smaller than max bigint)

      let finalTotalEarnings;
      if (profile.total_earnings_cents >= MAX_SAFE_EARNINGS) {
        // If already at maximum, don't add more earnings
        finalTotalEarnings = profile.total_earnings_cents;
        this.logger.warn(`⚠️ Driver earnings already at maximum (${MAX_SAFE_EARNINGS}), not adding more for user ${userId}`);
      } else {
        const newTotalEarnings = profile.total_earnings_cents + tripEarningsCents;
        finalTotalEarnings = newTotalEarnings > MAX_SAFE_EARNINGS ? MAX_SAFE_EARNINGS : newTotalEarnings;

        if (finalTotalEarnings !== newTotalEarnings) {
          this.logger.warn(`⚠️ BigInt overflow prevented for user ${userId}! Capped at maximum safe value: ${finalTotalEarnings}`);
        }
      }

      await this.driverProfilesRepository.update(profile.id, {
        total_trips: profile.total_trips + 1,
        total_earnings_cents: finalTotalEarnings,
      });

      this.logger.log(`✅ Trip stats updated for user ${userId}: trips=${profile.total_trips + 1}, earnings=${finalTotalEarnings}`);
    } catch (error) {
      this.logger.error(`Error updating trip stats for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get driver dashboard statistics (balance, today's earnings, acceptance rate)
   */
  async getDashboardStats(userId: string): Promise<DriverDashboardStatsDto> {
    try {
      // Get driver profile
      const profile = await this.driverProfilesRepository.findByUserId(userId);
      if (!profile) {
        throw new NotFoundException('Driver profile not found');
      }

      // Get wallet balance
      let balance = 0;
      try {
        const walletBalance = await this.walletService.getWalletBalance(userId);
        balance = walletBalance.balance || 0;
      } catch (error) {
        this.logger.warn(`Failed to get wallet balance for user ${userId}:`, error);
        balance = 0;
      }

      // Get today's earnings (last 24 hours)
      const client = await this.postgresService.getClient();
      let todayEarnings = 0;
      let acceptanceRate = 0;

      try {
        const twentyFourHoursAgo = new Date();
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

        // Get completed trips in last 24 hours with driver earnings
        const todayEarningsQuery = `
          SELECT COALESCE(SUM(driver_earnings_cents), 0) as earnings_cents
          FROM trips
          WHERE driver_id = $1
            AND status = 'completed'
            AND completed_at >= $2
            AND driver_earnings_cents IS NOT NULL
        `;
        const earningsResult = await client.query(todayEarningsQuery, [profile.id, twentyFourHoursAgo]);
        todayEarnings = parseFloat(earningsResult.rows[0]?.earnings_cents || '0') / 100;

        // Calculate acceptance rate based on support trips
        // Support trips are trips that were requested (broadcast by customer support)
        // and either accepted or declined by this driver
        // For a more accurate calculation, we'll look at:
        // 1. Trips accepted by this driver (support trips)
        // 2. Trips declined by this driver (canceled by this driver)
        
        // Get all support trips that were assigned to this driver
        // Support trips have request_timestamp and were either accepted or declined by this driver
        const totalSupportTripsQuery = `
          SELECT 
            COUNT(*) FILTER (WHERE status IN ('accepted', 'in_progress', 'completed') AND accepted_at IS NOT NULL) as accepted_count,
            COUNT(*) FILTER (WHERE status = 'canceled' AND canceled_by_user_id = (SELECT user_id FROM driver_profiles WHERE id = $1)) as declined_count
          FROM trips
          WHERE driver_id = $1
            AND request_timestamp IS NOT NULL
            AND EXTRACT(EPOCH FROM (COALESCE(accepted_at, canceled_at, created_at) - request_timestamp)) >= 0
        `;
        const supportTripsResult = await client.query(totalSupportTripsQuery, [profile.id]);
        const acceptedCount = parseInt(supportTripsResult.rows[0]?.accepted_count || '0', 10);
        const declinedCount = parseInt(supportTripsResult.rows[0]?.declined_count || '0', 10);

        // Calculate acceptance rate
        // Acceptance rate = (Accepted trips / (Accepted + Declined trips)) * 100
        const totalSupportTrips = acceptedCount + declinedCount;
        if (totalSupportTrips > 0) {
          acceptanceRate = (acceptedCount / totalSupportTrips) * 100;
        } else {
          // If no support trips yet, check if driver has any completed trips
          // If yes, assume good acceptance rate (could be improved with actual tracking)
          const hasCompletedTripsQuery = `
            SELECT COUNT(*) as completed_count
            FROM trips
            WHERE driver_id = $1
              AND status = 'completed'
          `;
          const completedResult = await client.query(hasCompletedTripsQuery, [profile.id]);
          const completedCount = parseInt(completedResult.rows[0]?.completed_count || '0', 10);
          // Default to 100% for new drivers, 95% if they have completed trips
          acceptanceRate = completedCount > 0 ? 95.0 : 100.0;
        }

        // Round acceptance rate to 2 decimal places
        acceptanceRate = Math.round(acceptanceRate * 100) / 100;
      } catch (error) {
        this.logger.error(`Error calculating dashboard stats for user ${userId}:`, error);
        // Set defaults on error
        todayEarnings = 0;
        acceptanceRate = 100;
      } finally {
        client.release();
      }

      return new DriverDashboardStatsDto({
        balance,
        todayEarnings,
        acceptanceRate,
      });
    } catch (error) {
      this.logger.error(`Error getting dashboard stats for user ${userId}:`, error);
      throw error;
    }
  }
}
