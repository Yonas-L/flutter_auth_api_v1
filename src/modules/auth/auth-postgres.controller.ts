import { Controller, Post, Body, Get, UseGuards, Request, HttpException, HttpStatus, Logger, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthPostgresService } from './auth-postgres.service';
import { OtpService } from '../otp/otp.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth/v2')
export class AuthPostgresController {
    private readonly logger = new Logger(AuthPostgresController.name);

    constructor(
        private authPostgresService: AuthPostgresService,
        private otpService: OtpService
    ) { }

    /**
     * Request OTP for phone number authentication
     */
    @Post('otp/request-phone')
    async requestOtpForPhone(@Body() body: { phoneNumber: string }) {
        try {
            this.logger.log(`📱 OTP request for phone: ${body.phoneNumber}`);
            return await this.authPostgresService.requestOtpForPhone(body.phoneNumber);
        } catch (error) {
            this.logger.error(`❌ Error requesting OTP for phone:`, error);
            throw new HttpException(
                error.message || 'Failed to send OTP',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Verify OTP for phone number authentication
     */
    @Post('otp/verify-phone')
    async verifyOtpForPhone(@Body() body: { phoneNumber: string; code: string }) {
        try {
            this.logger.log(`🔐 OTP verification for phone: ${body.phoneNumber}`);
            return await this.authPostgresService.verifyOtpForPhone(body.phoneNumber, body.code);
        } catch (error) {
            this.logger.error(`❌ Error verifying OTP for phone:`, error);
            throw new HttpException(
                error.message || 'Failed to verify OTP',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Request OTP for email authentication
     */
    @Post('otp/request-email')
    async requestOtpForEmail(@Body() body: { email: string }) {
        try {
            this.logger.log(`📧 OTP request for email: ${body.email}`);
            return await this.authPostgresService.requestOtpForEmail(body.email);
        } catch (error) {
            this.logger.error(`❌ Error requesting OTP for email:`, error);
            throw new HttpException(
                error.message || 'Failed to send OTP',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Verify OTP for email authentication
     */
    @Post('otp/verify-email')
    async verifyOtpForEmail(@Body() body: { email: string; code: string }) {
        try {
            this.logger.log(`🔐 OTP verification for email: ${body.email}`);
            return await this.authPostgresService.verifyOtpForEmail(body.email, body.code);
        } catch (error) {
            this.logger.error(`❌ Error verifying OTP for email:`, error);
            throw new HttpException(
                error.message || 'Failed to verify OTP',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Refresh access token
     */
    @Post('refresh')
    async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
        try {
            this.logger.log(`🔄 Token refresh request`);
            return await this.authPostgresService.refreshToken(refreshTokenDto.refreshToken);
        } catch (error) {
            this.logger.error(`❌ Error refreshing token:`, error);
            throw new HttpException(
                error.message || 'Failed to refresh token',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Logout user
     */
    @Post('logout')
    @UseGuards(AuthGuard('jwt-postgres'))
    async logout(@Request() req: any) {
        try {
            this.logger.log(`👋 Logout request for user: ${req.user.id}`);
            return await this.authPostgresService.logout(req.user.id);
        } catch (error) {
            this.logger.error(`❌ Error logging out user:`, error);
            throw new HttpException(
                error.message || 'Failed to logout',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Get current user profile
     */
    @Get('me')
    @UseGuards(AuthGuard('jwt-postgres'))
    async getProfile(@Request() req: any) {
        try {
            this.logger.log(`👤 Profile request for user: ${req.user.id}`);
            return await this.authPostgresService.getProfile(req.user.id);
        } catch (error) {
            this.logger.error(`❌ Error getting profile:`, error);
            throw new HttpException(
                error.message || 'Failed to get profile',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Health check for auth service
     */
    @Get('health')
    async healthCheck() {
        return {
            status: 'healthy',
            service: 'auth-postgres',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
        };
    }

    /**
     * Debug endpoint to check current OTP (for testing only)
     */
    @Get('debug/otp/:phoneNumber')
    async getCurrentOtp(@Param('phoneNumber') phoneNumber: string) {
        // This is for testing only - in production, remove this endpoint
        try {
            const otpRecord = await this.otpService.findValidOtp(phoneNumber, 'login');
            if (otpRecord) {
                return {
                    phoneNumber,
                    purpose: otpRecord.purpose,
                    expiresAt: otpRecord.expires_at,
                    attempts: otpRecord.attempts,
                    isUsed: otpRecord.is_used,
                    // Note: We can't return the actual code as it's hashed
                    message: 'OTP found in database (code is hashed for security)'
                };
            } else {
                return { message: 'No valid OTP found for this phone number' };
            }
        } catch (error) {
            return { error: error.message };
        }
    }
}

