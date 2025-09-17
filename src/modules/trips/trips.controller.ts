import { Controller, Get, Post, Put, Query, Param, Body, UseGuards, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TripsService } from './trips.service';
import type { User } from '../database/entities/user.entity';

@Controller('api/trips')
@UseGuards(JwtAuthGuard)
export class TripsController {
    private readonly logger = new Logger(TripsController.name);

    constructor(private readonly tripsService: TripsService) { }

    @Post()
    async createTrip(
        @CurrentUser() user: User,
        @Body() createTripDto: any,
    ) {
        try {
            const trip = await this.tripsService.createTrip(user.id, createTripDto);

            return {
                success: true,
                trip,
                message: 'Trip created successfully',
            };
        } catch (error) {
            this.logger.error(`Error creating trip for user ${user.id}:`, error);
            throw new HttpException(
                'Failed to create trip',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get('history')
    async getTripHistory(
        @CurrentUser() user: User,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20',
        @Query('status') status?: string,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ) {
        try {
            const pageNum = parseInt(page, 10) || 1;
            const limitNum = parseInt(limit, 10) || 20;

            const filters = {
                status: status && status !== 'all' ? status : undefined,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
            };

            const result = await this.tripsService.getTripHistory(
                user.id,
                pageNum,
                limitNum,
                filters,
            );

            return {
                success: true,
                trips: result.trips,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total: result.total,
                    totalPages: Math.ceil(result.total / limitNum),
                    hasMore: pageNum * limitNum < result.total,
                },
            };
        } catch (error) {
            this.logger.error(`Error fetching trip history for user ${user.id}:`, error);
            throw new HttpException(
                'Failed to fetch trip history',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get('statistics')
    async getTripStatistics(
        @CurrentUser() user: User,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ) {
        try {
            const filters = {
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
            };

            const statistics = await this.tripsService.getTripStatistics(user.id, filters);

            return {
                success: true,
                ...statistics,
            };
        } catch (error) {
            this.logger.error(`Error fetching trip statistics for user ${user.id}:`, error);
            throw new HttpException(
                'Failed to fetch trip statistics',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get('active')
    async getActiveTrip(@CurrentUser() user: User) {
        try {
            const activeTrip = await this.tripsService.getActiveTrip(user.id);

            if (!activeTrip) {
                return {
                    success: true,
                    trip: null,
                    message: 'No active trip found',
                };
            }

            return {
                success: true,
                trip: activeTrip,
            };
        } catch (error) {
            this.logger.error(`Error fetching active trip for user ${user.id}:`, error);
            throw new HttpException(
                'Failed to fetch active trip',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get(':id')
    async getTripDetail(
        @CurrentUser() user: User,
        @Param('id') tripId: string,
    ) {
        try {
            // Validate that tripId is a valid UUID
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(tripId)) {
                throw new HttpException('Invalid trip ID format', HttpStatus.BAD_REQUEST);
            }

            const trip = await this.tripsService.getTripDetail(tripId, user.id);

            if (!trip) {
                throw new HttpException('Trip not found', HttpStatus.NOT_FOUND);
            }

            return {
                success: true,
                trip,
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            this.logger.error(`Error fetching trip detail ${tripId}:`, error);
            throw new HttpException(
                'Failed to fetch trip detail',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Put(':id/start')
    async startTrip(
        @CurrentUser() user: User,
        @Param('id') tripId: string,
    ) {
        try {
            // Validate that tripId is a valid UUID
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(tripId)) {
                throw new HttpException('Invalid trip ID format', HttpStatus.BAD_REQUEST);
            }

            const trip = await this.tripsService.startTrip(user.id, tripId);

            return {
                success: true,
                trip,
                message: 'Trip started successfully',
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            this.logger.error(`Error starting trip ${tripId} for user ${user.id}:`, error);
            throw new HttpException(
                'Failed to start trip',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}