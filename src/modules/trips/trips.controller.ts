import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
  Logger,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TripsService } from './trips.service';

@Controller('api/trips')
export class TripsController {
  private readonly logger = new Logger(TripsController.name);

  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createTrip(@Request() req: any, @Body() createTripDto: any) {
    try {
      const userId = req.user.id;
      this.logger.log(`Creating trip for driver: ${userId}`);

      const trip = await this.tripsService.createTrip(userId, createTripDto);
      
      this.logger.log(`Trip created successfully: ${trip.id}`);
      return {
        success: true,
        trip,
        message: 'Trip created successfully'
      };
    } catch (error) {
      this.logger.error('Error creating trip:', error);
      throw new HttpException(
        error.message || 'Failed to create trip',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('active')
  @UseGuards(AuthGuard('jwt'))
  async getActiveTrip(@Request() req: any) {
    try {
      const userId = req.user.id;
      this.logger.log(`Getting active trip for driver: ${userId}`);

      const trip = await this.tripsService.getActiveTrip(userId);
      
      if (!trip) {
        return {
          success: true,
          trip: null,
          message: 'No active trip found'
        };
      }

      return {
        success: true,
        trip,
        message: 'Active trip retrieved successfully'
      };
    } catch (error) {
      this.logger.error('Error getting active trip:', error);
      throw new HttpException(
        error.message || 'Failed to get active trip',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Put(':id/start')
  @UseGuards(AuthGuard('jwt'))
  async startTrip(@Request() req: any, @Param('id') tripId: string) {
    try {
      const userId = req.user.id;
      this.logger.log(`Starting trip ${tripId} for driver: ${userId}`);

      const trip = await this.tripsService.startTrip(userId, tripId);
      
      return {
        success: true,
        trip,
        message: 'Trip started successfully'
      };
    } catch (error) {
      this.logger.error('Error starting trip:', error);
      throw new HttpException(
        error.message || 'Failed to start trip',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Put(':id/cancel')
  @UseGuards(AuthGuard('jwt'))
  async cancelTrip(@Request() req: any, @Param('id') tripId: string, @Body() cancelData: any) {
    try {
      const userId = req.user.id;
      this.logger.log(`Canceling trip ${tripId} for driver: ${userId}`);

      const trip = await this.tripsService.cancelTrip(userId, tripId, cancelData);
      
      return {
        success: true,
        trip,
        message: 'Trip canceled successfully'
      };
    } catch (error) {
      this.logger.error('Error canceling trip:', error);
      throw new HttpException(
        error.message || 'Failed to cancel trip',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Put(':id/complete')
  @UseGuards(AuthGuard('jwt'))
  async completeTrip(@Request() req: any, @Param('id') tripId: string, @Body() completeData: any) {
    try {
      const userId = req.user.id;
      this.logger.log(`Completing trip ${tripId} for driver: ${userId}`);

      const trip = await this.tripsService.completeTrip(userId, tripId, completeData);
      
      return {
        success: true,
        trip,
        message: 'Trip completed successfully'
      };
    } catch (error) {
      this.logger.error('Error completing trip:', error);
      throw new HttpException(
        error.message || 'Failed to complete trip',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
