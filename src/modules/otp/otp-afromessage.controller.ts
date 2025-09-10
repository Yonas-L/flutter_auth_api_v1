import { Controller, Post, Get, Body, Query, Param, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { AfroMessageService } from './afro-message.service';
import { OtpService } from './otp.service';
import { AuthPostgresService } from '../auth/auth-postgres.service';

export interface SendOtpRequest {
    to: string;
    ttl?: number;
    from?: string;
    sender?: string;
}

export interface VerifyOtpRequest {
    to: string;
    code: string;
    vc?: string;
}

@Controller('otp/afromessage')
export class OtpAfroMessageController {
    private readonly logger = new Logger(OtpAfroMessageController.name);

    constructor(
        private readonly afroMessageService: AfroMessageService,
        private readonly otpService: OtpService,
        private readonly authPostgresService: AuthPostgresService
    ) { }

    /**
     * Send OTP - matches AfroMessage /send endpoint
     * POST /otp/send
     */
    @Post('send')
    async sendOtp(@Body() request: SendOtpRequest) {
        try {
            this.logger.log(`📱 Sending OTP to: ${request.to}`);

            // Validate required fields
            if (!request.to) {
                throw new HttpException('Missing required parameter: to', HttpStatus.BAD_REQUEST);
            }

            // Use AfroMessage to send OTP
            const result = await this.afroMessageService.sendOtp(
                request.to,
                request.ttl || 600
            );

            if (!result.success) {
                throw new HttpException(
                    `Failed to send OTP: ${result.error}`,
                    HttpStatus.BAD_REQUEST
                );
            }

            // Store OTP in our database for tracking
            await this.otpService.storeAfroMessageOtp(
                request.to,
                result.code!,
                result.verificationId!,
                result.messageId!,
                request.ttl || 600
            );

            this.logger.log(`✅ OTP sent successfully to ${request.to}`);

            return {
                acknowledge: 'success',
                response: {
                    message_id: result.messageId,
                    verification_id: result.verificationId,
                    code: result.code,
                    to: request.to,
                    ttl: request.ttl || 600
                }
            };
        } catch (error) {
            this.logger.error(`❌ Error sending OTP:`, error);
            throw error;
        }
    }

    /**
     * Verify OTP - matches AfroMessage /verify endpoint
     * POST /otp/verify
     */
    @Post('verify')
    async verifyOtp(@Body() request: VerifyOtpRequest) {
        try {
            this.logger.log(`🔍 Verifying OTP for: ${request.to}`);

            // Validate required fields
            if (!request.to || !request.code) {
                throw new HttpException('Missing required parameters: to, code', HttpStatus.BAD_REQUEST);
            }

            // Use AfroMessage to verify OTP
            const result = await this.afroMessageService.verifyOtp(
                request.to,
                request.code,
                request.vc
            );

            if (!result.success) {
                throw new HttpException(
                    `OTP verification failed: ${result.error}`,
                    HttpStatus.BAD_REQUEST
                );
            }

            if (result.valid) {
                this.logger.log(`✅ OTP verified successfully for ${request.to}`);

                // Create or get PostgreSQL user and issue tokens BEFORE deleting OTP
                try {
                    const tokens = await this.authPostgresService.createOrAuthenticateUser(request.to);
                    this.logger.log(`✅ User authenticated successfully for ${request.to}`);

                    // Delete OTP from database after successful user creation
                    await this.otpService.deleteOtpAfterVerification(request.to, request.code);

                    return {
                        acknowledge: 'success',
                        response: {
                            valid: result.valid,
                            to: request.to,
                            message: 'OTP verified successfully'
                        },
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken,
                        user: tokens.user
                    };
                } catch (authError) {
                    this.logger.error(`❌ Error creating user for ${request.to}:`, authError);
                    // Still return success for OTP verification, but without user creation
                    return {
                        acknowledge: 'success',
                        response: {
                            valid: result.valid,
                            to: request.to,
                            message: 'OTP verified successfully'
                        }
                    };
                }
            }

            return {
                acknowledge: 'success',
                response: {
                    valid: result.valid,
                    to: request.to,
                    message: result.valid ? 'OTP verified successfully' : 'Invalid OTP code'
                }
            };
        } catch (error) {
            this.logger.error(`❌ Error verifying OTP:`, error);
            throw error;
        }
    }

    /**
     * Health check endpoint
     * GET /otp/health
     */
    @Get('health')
    async health() {
        return {
            status: 'ok',
            service: 'otp-afromessage',
            timestamp: new Date().toISOString(),
            env_check: {
                hasApiKey: !!process.env.AFRO_SMS_KEY,
                apiKeyPreview: process.env.AFRO_SMS_KEY ? `${process.env.AFRO_SMS_KEY.substring(0, 20)}...` : 'NOT_SET'
            }
        };
    }

    /**
     * Test endpoint without authentication
     * GET /otp/test
     */
    @Get('test')
    async test() {
        return {
            message: 'OTP test endpoint working',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Debug endpoint to check OTP in database
     * GET /otp/debug/:phoneNumber
     */
    @Get('debug/:phoneNumber')
    async debugOtp(@Param('phoneNumber') phoneNumber: string) {
        try {
            // Find OTP records for this phone number
            const otpRecords = await this.otpService.findOtpsForPhone(phoneNumber);

            return {
                phoneNumber,
                otpCount: otpRecords.length,
                otps: otpRecords.map(otp => ({
                    id: otp.id,
                    phoneNumber: otp.phone_number,
                    purpose: otp.purpose,
                    expiresAt: otp.expires_at,
                    attempts: otp.attempts,
                    maxAttempts: otp.max_attempts,
                    isUsed: otp.is_used,
                    createdAt: otp.created_at,
                    // Don't return the actual code for security
                    hasCode: !!otp.code_hash
                }))
            };
        } catch (error) {
            return {
                error: error.message,
                phoneNumber
            };
        }
    }
}
