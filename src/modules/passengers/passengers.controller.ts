import {
    Controller,
    Post,
    Get,
    Put,
    Delete,
    Body,
    Param,
    UseGuards,
    Request,
    HttpCode,
    HttpStatus,
    HttpException,
    Logger,
} from '@nestjs/common';
import { PassengersService } from './passengers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PassengerLoginDto } from './dto/passenger-login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UpdatePassengerProfileDto } from './dto/update-passenger-profile.dto';
import { CreateFavoritePlaceDto } from './dto/create-favorite-place.dto';
import { RateTripDto } from './dto/rate-trip.dto';
import { PostgresService } from '../database/postgres.service';

@Controller('api')
export class PassengersController {
    private readonly logger = new Logger(PassengersController.name);

    constructor(
        private readonly passengersService: PassengersService,
        private readonly postgresService: PostgresService,
    ) { }

    /**
     * Send OTP to passenger's phone
     * POST /api/auth/login
     */
    @Post('auth/login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() loginDto: PassengerLoginDto) {
        this.logger.log(`Passenger login request: ${loginDto.phoneNumber}`);
        return this.passengersService.sendLoginOtp(loginDto.phoneNumber);
    }

    /**
     * Verify OTP and get JWT token
     * POST /api/auth/verify
     */
    @Post('auth/verify')
    @HttpCode(HttpStatus.OK)
    async verify(@Body() verifyDto: VerifyOtpDto) {
        this.logger.log(`OTP verification request: ${verifyDto.phoneNumber}`);
        return this.passengersService.verifyOtp(verifyDto.phoneNumber, verifyDto.otp);
    }

    /**
     * Get passenger profile
     * GET /api/user/profile
     */
    @Get('user/profile')
    @UseGuards(JwtAuthGuard)
    async getProfile(@Request() req) {
        return this.passengersService.getProfile(req.user.userId);
    }

    /**
     * Update passenger profile
     * PUT /api/user/profile
     */
    @Put('user/profile')
    @UseGuards(JwtAuthGuard)
    async updateProfile(@Request() req, @Body() updateDto: UpdatePassengerProfileDto) {
        return this.passengersService.updateProfile(req.user.userId, updateDto);
    }

    /**
     * Get trip history
     * GET /api/trips/history
     */
    @Get('trips/history')
    @UseGuards(JwtAuthGuard)
    async getTripHistory(@Request() req) {
        return this.passengersService.getTripHistory(req.user.userId);
    }

    /**
     * Rate a trip
     * POST /api/trips/:tripId/rate
     */
    @Post('trips/:tripId/rate')
    @UseGuards(JwtAuthGuard)
    async rateTrip(@Request() req, @Param('tripId') tripId: string, @Body() rateDto: RateTripDto) {
        return this.passengersService.rateTrip(req.user.userId, tripId, rateDto);
    }

    /**
     * Get favorite places
     * GET /api/user/favorite-places
     */
    @Get('user/favorite-places')
    @UseGuards(JwtAuthGuard)
    async getFavoritePlaces(@Request() req) {
        return this.passengersService.getFavoritePlaces(req.user.userId);
    }

    /**
     * Create favorite place
     * POST /api/user/favorite-places
     */
    @Post('user/favorite-places')
    @UseGuards(JwtAuthGuard)
    async createFavoritePlace(@Request() req, @Body() createDto: CreateFavoritePlaceDto) {
        return this.passengersService.createFavoritePlace(req.user.userId, createDto);
    }

    /**
     * Delete favorite place
     * DELETE /api/user/favorite-places/:favoritePlaceId
     */
    @Delete('user/favorite-places/:favoritePlaceId')
    @UseGuards(JwtAuthGuard)
    async deleteFavoritePlace(@Request() req, @Param('favoritePlaceId') favoritePlaceId: string) {
        return this.passengersService.deleteFavoritePlace(req.user.userId, favoritePlaceId);
    }

    /**
     * Get notifications
     * GET /api/notifications
     */
    @Get('notifications')
    @UseGuards(JwtAuthGuard)
    async getNotifications(@Request() req) {
        return this.passengersService.getNotifications(req.user.userId);
    }

    /**
     * Mark all notifications as read
     * POST /api/notifications/mark-all-as-read
     */
    @Post('notifications/mark-all-as-read')
    @UseGuards(JwtAuthGuard)
    async markAllNotificationsAsRead(@Request() req) {
        return this.passengersService.markAllNotificationsAsRead(req.user.userId);
    }

    /**
     * Get active ads
     * GET /api/ads
     */
    @Get('ads')
    async getAds() {
        try {
            const query = 'SELECT id, title, image_url, target_url FROM ads WHERE is_active = true ORDER BY sort_order ASC';
            const { rows } = await this.postgresService.query(query);
            return rows;
        } catch (error) {
            this.logger.error(`Failed to get ads: ${error.message}`);
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get vehicle types
     * GET /api/vehicle-types
     */
    @Get('vehicle-types')
    async getVehicleTypes() {
        try {
            const query = 'SELECT type, display_name, image_url, seats, base_fare, price_per_km FROM vehicle_types WHERE is_active = true ORDER BY sort_order ASC';
            const { rows } = await this.postgresService.query(query);
            // Format numbers for JSON response
            const formattedData = rows.map(car => ({
                ...car,
                base_fare: parseFloat(car.base_fare),
                price_per_km: parseFloat(car.price_per_km),
            }));
            return formattedData;
        } catch (error) {
            this.logger.error(`Failed to get vehicle types: ${error.message}`);
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}
