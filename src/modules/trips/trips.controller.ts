import { Controller, Get, Query, Param, UseGuards, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TripsService } from './trips.service';
import type { User } from '../database/entities/user.entity';

@Controller('api/trips')
@UseGuards(JwtAuthGuard)
export class TripsController {
    private readonly logger = new Logger(TripsController.name);

    constructor(private readonly tripsService: TripsService) { }

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

    @Get(':id')
    async getTripDetail(
        @CurrentUser() user: User,
        @Param('id') tripId: string,
    ) {
        try {
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
}