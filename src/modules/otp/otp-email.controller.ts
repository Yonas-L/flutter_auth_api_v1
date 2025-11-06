import { Controller, Post, Body, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { OtpService } from './otp.service';
import { SimpleAuthService } from '../auth/simple-auth.service';

export interface SendEmailOtpRequest {
    email: string;
    ttl?: number;
    purpose?: string;
}

export interface VerifyEmailOtpRequest {
    email: string;
    code: string;
}

@Controller('otp/email')
export class OtpEmailController {
    private readonly logger = new Logger(OtpEmailController.name);

    constructor(
        private readonly otpService: OtpService,
        private readonly simpleAuthService: SimpleAuthService
    ) { }

    /**
     * Send OTP via email
     * POST /otp/email/send
     */
    @Post('send')
    async sendEmailOtp(@Body() request: SendEmailOtpRequest) {
        try {
            this.logger.log(`📧 Sending email OTP to: ${request.email}`);

            // Validate email format
            if (!request.email) {
                throw new HttpException('Missing required parameter: email', HttpStatus.BAD_REQUEST);
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(request.email)) {
                throw new HttpException('Invalid email format', HttpStatus.BAD_REQUEST);
            }

            // Create and send email OTP
            const purpose = request.purpose || 'login';
            const expiresInMinutes = request.ttl ? Math.floor(request.ttl / 60) : 10;
            
            const result = await this.otpService.createOtpForEmail(
                request.email.toLowerCase(),
                expiresInMinutes,
                purpose
            );

            this.logger.log(`✅ Email OTP sent successfully to ${request.email}`);

            return {
                acknowledge: 'success',
                response: {
                    code: result.code, // Return code for testing (remove in production)
                    email: request.email,
                    ttl: request.ttl || 600,
                    expiresAt: result.expiresAt
                }
            };
        } catch (error) {
            this.logger.error(`❌ Error sending email OTP:`, error);
            throw error;
        }
    }

    /**
     * Verify email OTP
     * POST /otp/email/verify
     */
    @Post('verify')
    async verifyEmailOtp(@Body() request: VerifyEmailOtpRequest) {
        try {
            this.logger.log(`🔍 Verifying email OTP for: ${request.email}`);

            // Validate required fields
            if (!request.email || !request.code) {
                throw new HttpException('Missing required parameters: email, code', HttpStatus.BAD_REQUEST);
            }

            // Verify OTP against database
            let verificationResult = await this.otpService.verifyOtpForEmail(
                request.email.toLowerCase(),
                request.code,
                'login'
            );

            // If login verification fails, try registration purpose
            if (!verificationResult.valid) {
                this.logger.log(`🔄 Login OTP failed, trying registration purpose for ${request.email}`);
                verificationResult = await this.otpService.verifyOtpForEmail(
                    request.email.toLowerCase(),
                    request.code,
                    'registration'
                );
            }

            if (!verificationResult.valid) {
                this.logger.warn(`❌ Invalid OTP for ${request.email}: ${verificationResult.message}`);
                throw new HttpException(
                    verificationResult.message || 'Invalid OTP code',
                    HttpStatus.BAD_REQUEST
                );
            }

            this.logger.log(`✅ Email OTP verified successfully for ${request.email}`);

            try {
                // Authenticate user by email and get JWT tokens
                this.logger.log(`🔐 Authenticating user for email: ${request.email}`);
                const authResult = await this.simpleAuthService.authenticateUserByEmail(request.email.toLowerCase());

                this.logger.log(`✅ User authenticated successfully for ${request.email}, User ID: ${authResult.user.id}, redirecting to: ${authResult.redirectTo}`);

                return {
                    acknowledge: 'success',
                    response: {
                        valid: true,
                        email: request.email,
                        message: 'OTP verified successfully'
                    },
                    accessToken: authResult.accessToken,
                    refreshToken: authResult.refreshToken,
                    user: authResult.user,
                    redirectTo: authResult.redirectTo
                };
            } catch (authError) {
                this.logger.error(`❌ Error processing email OTP verification for ${request.email}:`, authError);
                throw new HttpException(
                    `Authentication failed: ${authError.message}`,
                    HttpStatus.INTERNAL_SERVER_ERROR
                );
            }
        } catch (error) {
            this.logger.error(`❌ Error verifying email OTP:`, error);
            throw error;
        }
    }
}

