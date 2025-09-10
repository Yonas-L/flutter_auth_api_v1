import { Controller, Post, Get, Body, Param, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import type { CompleteRegistrationData } from './registration.service';

@Controller('api/registration')
export class RegistrationController {
    private readonly logger = new Logger(RegistrationController.name);

    constructor(private readonly registrationService: RegistrationService) { }

    /**
     * Complete driver registration
     * POST /api/registration/complete
     */
    @Post('complete')
    async completeDriverRegistration(@Body() body: CompleteRegistrationData) {
        try {
            this.logger.log(`🚀 Starting complete driver registration for user: ${body.userId}`);

            // Validate required fields
            this.validateRegistrationData(body);

            const result = await this.registrationService.completeDriverRegistration(body);

            this.logger.log(`✅ Driver registration completed successfully for user: ${body.userId}`);

            return {
                success: true,
                message: 'Driver registration completed successfully',
                data: result
            };

        } catch (error) {
            this.logger.error(`❌ Driver registration failed for user ${body.userId}:`, error);

            throw new HttpException(
                {
                    success: false,
                    message: error.message || 'Registration failed',
                    error: 'REGISTRATION_FAILED'
                },
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Get registration progress
     * GET /api/registration/progress/:userId
     */
    @Get('progress/:userId')
    async getRegistrationProgress(@Param('userId') userId: string) {
        try {
            this.logger.log(`📊 Getting registration progress for user: ${userId}`);

            const progress = await this.registrationService.getRegistrationProgress(userId);

            return {
                success: true,
                data: progress
            };

        } catch (error) {
            this.logger.error(`❌ Failed to get registration progress for user ${userId}:`, error);

            throw new HttpException(
                {
                    success: false,
                    message: error.message || 'Failed to get registration progress',
                    error: 'PROGRESS_CHECK_FAILED'
                },
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Validate registration data
     */
    private validateRegistrationData(data: CompleteRegistrationData): void {
        const requiredFields = [
            'userId', 'userPhone', 'fullName', 'dateOfBirth', 'address', 'gender',
            'phoneNumber', 'emergencyContactName', 'emergencyContactPhone',
            'vehicleMake', 'vehicleModel', 'vehicleYear', 'vehicleColor',
            'vehiclePlateNumber', 'vehicleTransmission', 'vehicleClassId',
            'driverLicenseNumber', 'driverLicenseExpiry'
        ];

        const missingFields = requiredFields.filter(field => !data[field as keyof CompleteRegistrationData]);

        if (missingFields.length > 0) {
            throw new HttpException(
                {
                    success: false,
                    message: `Missing required fields: ${missingFields.join(', ')}`,
                    error: 'VALIDATION_ERROR'
                },
                HttpStatus.BAD_REQUEST
            );
        }

        // Validate email format if provided
        if (data.email && !this.isValidEmail(data.email)) {
            throw new HttpException(
                {
                    success: false,
                    message: 'Invalid email format',
                    error: 'VALIDATION_ERROR'
                },
                HttpStatus.BAD_REQUEST
            );
        }

        // Validate phone number format
        if (!this.isValidPhoneNumber(data.phoneNumber)) {
            throw new HttpException(
                {
                    success: false,
                    message: 'Invalid phone number format',
                    error: 'VALIDATION_ERROR'
                },
                HttpStatus.BAD_REQUEST
            );
        }

        // Validate vehicle year
        const currentYear = new Date().getFullYear();
        const vehicleYear = parseInt(data.vehicleYear);
        if (isNaN(vehicleYear) || vehicleYear < 1970 || vehicleYear > currentYear + 1) {
            throw new HttpException(
                {
                    success: false,
                    message: 'Invalid vehicle year',
                    error: 'VALIDATION_ERROR'
                },
                HttpStatus.BAD_REQUEST
            );
        }
    }

    /**
     * Validate email format
     */
    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate phone number format
     */
    private isValidPhoneNumber(phone: string): boolean {
        // Basic phone number validation - adjust regex as needed
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }
}
