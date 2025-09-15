import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersPostgresRepository } from '../database/repositories/users-postgres.repository';
import { OtpService } from '../otp/otp.service';
import { AfroMessageService } from '../otp/afro-message.service';
import * as bcrypt from 'bcrypt';

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        phoneNumber?: string;
        email?: string;
        name?: string;
        userType: 'passenger' | 'driver' | 'admin';
        status: string;
        isPhoneVerified: boolean;
        isEmailVerified: boolean;
    };
}

export interface LoginCredentials {
    phoneNumber?: string;
    email?: string;
    password?: string;
    otp?: string;
}

@Injectable()
export class AuthPostgresService {
    private readonly logger = new Logger(AuthPostgresService.name);

    constructor(
        private jwtService: JwtService,
        private configService: ConfigService,
        private usersRepository: UsersPostgresRepository,
        private otpService: OtpService,
        private afroMessageService: AfroMessageService,
    ) { }

    /**
     * Request OTP for phone number authentication
     */
    async requestOtpForPhone(phoneNumber: string): Promise<{ message: string }> {
        try {
            this.logger.log(`📱 Requesting OTP for phone: ${phoneNumber}`);

            // Validate phone number format
            if (!this.validateEthiopianPhoneNumber(phoneNumber)) {
                throw new BadRequestException('Invalid Ethiopian phone number format');
            }

            // Normalize phone number
            const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

            // Create OTP record (generates OTP, sends via AfroMessage, and stores in database)
            const otpData = await this.otpService.createOtpForPhone(normalizedPhone, 10, 'login');

            this.logger.log(`✅ OTP sent successfully to ${normalizedPhone}`);
            return { message: 'OTP sent successfully to your phone' };
        } catch (error) {
            this.logger.error(`❌ Error requesting OTP for ${phoneNumber}:`, error);
            throw error;
        }
    }

    /**
     * Verify OTP and authenticate user
     */
    async verifyOtpForPhone(phoneNumber: string, otp: string): Promise<AuthTokens> {
        try {
            this.logger.log(`🔐 Verifying OTP for phone: ${phoneNumber}`);

            // Normalize phone number
            const normalizedPhone = this.normalizePhoneNumber(phoneNumber);

            // Verify OTP
            const otpResult = await this.otpService.verifyOtpForPhone(normalizedPhone, otp, 'registration');

            if (!otpResult.valid) {
                throw new BadRequestException(otpResult.message || 'Invalid OTP');
            }

            // Find or create user
            let user = await this.usersRepository.findByPhone(normalizedPhone);
            if (!user) {
                user = await this.usersRepository.create({
                    phone_number: normalizedPhone,
                    user_type: 'driver', // Driver app creates driver users
                    is_phone_verified: true,
                    is_active: true,
                    status: 'verified',
                });
                this.logger.log(`✅ Created new driver user: ${user.id}`);
            } else {
                // Update last login and verification status
                await this.usersRepository.updateLastLogin(user.id);
                if (!user.is_phone_verified) {
                    await this.usersRepository.update(user.id, { is_phone_verified: true });
                }
                this.logger.log(`✅ Authenticated existing user: ${user.id}`);
            }

            // Generate tokens
            const tokens = await this.generateTokens(user);

            return tokens;
        } catch (error) {
            this.logger.error(`❌ Error verifying OTP for ${phoneNumber}:`, error);
            throw error;
        }
    }

    /**
     * Create or authenticate user after OTP verification (OTP already verified)
     */
    async createOrAuthenticateUser(phoneNumber: string): Promise<AuthTokens> {
        try {
            this.logger.log(`🔐 Creating/authenticating user for phone: ${phoneNumber}`);

            // Normalize phone number
            const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
            this.logger.log(`🔐 Normalized phone: ${normalizedPhone}`);

            // Find or create user
            let user = await this.usersRepository.findByPhone(normalizedPhone);
            this.logger.log(`🔐 User lookup result: ${user ? `Found user ${user.id}` : 'User not found'}`);
            if (!user) {
                user = await this.usersRepository.create({
                    phone_number: normalizedPhone,
                    user_type: 'driver', // Driver app creates driver users
                    is_phone_verified: true,
                    is_active: true,
                    status: 'verified',
                });
                this.logger.log(`✅ Created new driver user: ${user.id}`);
            } else {
                // Update last login and verification status
                await this.usersRepository.updateLastLogin(user.id);
                if (!user.is_phone_verified) {
                    await this.usersRepository.update(user.id, { is_phone_verified: true });
                }
                this.logger.log(`✅ Authenticated existing user: ${user.id}`);
            }

            // Generate tokens
            const tokens = await this.generateTokens(user);

            return tokens;
        } catch (error) {
            this.logger.error(`❌ Error creating/authenticating user for ${phoneNumber}:`, error);
            throw error;
        }
    }

    /**
     * Request OTP for email authentication
     */
    async requestOtpForEmail(email: string): Promise<{ message: string }> {
        try {
            this.logger.log(`📧 Requesting OTP for email: ${email}`);

            // Validate email format
            if (!this.isValidEmail(email)) {
                throw new BadRequestException('Invalid email format');
            }

            // Generate OTP
            const otp = await this.otpService.generateOtp();

            // Create OTP record
            await this.otpService.createOtp(email, otp, 10);

            // Send OTP via email (you can implement email service here)
            // For now, we'll just log it
            this.logger.log(`📧 OTP for ${email}: ${otp} (in production, send via email)`);

            return { message: 'OTP sent successfully to your email' };
        } catch (error) {
            this.logger.error(`❌ Error requesting OTP for ${email}:`, error);
            throw error;
        }
    }

    /**
     * Verify OTP for email authentication
     */
    async verifyOtpForEmail(email: string, otp: string): Promise<AuthTokens> {
        try {
            this.logger.log(`🔐 Verifying OTP for email: ${email}`);

            // Verify OTP
            const otpResult = await this.otpService.verifyOtp(email, otp);

            if (!otpResult.valid) {
                throw new BadRequestException(otpResult.message || 'Invalid OTP');
            }

            // Find or create user
            let user = await this.usersRepository.findByEmail(email);
            if (!user) {
                user = await this.usersRepository.create({
                    email,
                    user_type: 'passenger',
                    is_email_verified: true,
                    is_active: true,
                    status: 'verified',
                });
                this.logger.log(`✅ Created new user: ${user.id}`);
            } else {
                // Update last login and verification status
                await this.usersRepository.updateLastLogin(user.id);
                if (!user.is_email_verified) {
                    await this.usersRepository.update(user.id, { is_email_verified: true });
                }
                this.logger.log(`✅ Authenticated existing user: ${user.id}`);
            }

            // Generate tokens
            const tokens = await this.generateTokens(user);

            return tokens;
        } catch (error) {
            this.logger.error(`❌ Error verifying OTP for ${email}:`, error);
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
        try {
            this.logger.log(`🔄 Refreshing token`);

            // Verify refresh token
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
            });

            // Find user
            const user = await this.usersRepository.findById(payload.sub);
            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            // Check if user is still active
            if (!user.is_active) {
                throw new UnauthorizedException('User account is deactivated');
            }

            // Generate new access token
            const accessToken = this.jwtService.sign(
                { sub: user.id, phoneNumber: user.phone_number, email: user.email },
                {
                    secret: this.configService.get('JWT_ACCESS_SECRET'),
                    expiresIn: this.configService.get('ACCESS_EXPIRES_IN') || '15m',
                }
            );

            this.logger.log(`✅ Token refreshed for user: ${user.id}`);
            return { accessToken };
        } catch (error) {
            this.logger.error(`❌ Error refreshing token:`, error);
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    /**
     * Logout user (invalidate tokens)
     */
    async logout(userId: string): Promise<{ message: string }> {
        try {
            this.logger.log(`👋 Logging out user: ${userId}`);

            // Update last login time
            await this.usersRepository.updateLastLogin(userId);

            // In a more sophisticated implementation, you could:
            // - Add tokens to a blacklist
            // - Store session information
            // - Send logout events

            this.logger.log(`✅ User logged out: ${userId}`);
            return { message: 'Logged out successfully' };
        } catch (error) {
            this.logger.error(`❌ Error logging out user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Get user profile
     */
    async getProfile(userId: string): Promise<any> {
        try {
            const user = await this.usersRepository.findById(userId);
            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            return {
                id: user.id,
                phoneNumber: user.phone_number,
                email: user.email,
                name: user.display_name,
                userType: user.user_type,
                status: user.status,
                isPhoneVerified: user.is_phone_verified,
                isEmailVerified: user.is_email_verified,
                createdAt: user.created_at,
                lastLoginAt: user.last_login_at,
            };
        } catch (error) {
            this.logger.error(`❌ Error getting profile for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Generate JWT tokens for user
     */
    private async generateTokens(user: any): Promise<AuthTokens> {
        const payload = {
            sub: user.id,
            phoneNumber: user.phone_number,
            email: user.email,
            userType: user.user_type,
        };

        const accessToken = this.jwtService.sign(payload, {
            secret: this.configService.get('JWT_ACCESS_SECRET'),
            expiresIn: this.configService.get('ACCESS_EXPIRES_IN') || '15m',
        });

        const refreshToken = this.jwtService.sign(payload, {
            secret: this.configService.get('JWT_REFRESH_SECRET'),
            expiresIn: this.configService.get('REFRESH_EXPIRES_IN') || '7d',
        });

        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                phoneNumber: user.phone_number,
                email: user.email,
                name: user.display_name,
                userType: user.user_type,
                status: user.status,
                isPhoneVerified: user.is_phone_verified,
                isEmailVerified: user.is_email_verified,
            },
        };
    }

    /**
     * Validate Ethiopian phone number
     */
    private validateEthiopianPhoneNumber(phone: string): boolean {
        const phoneRegex = /^(\+251|251|0)?[79]\d{8}$/;
        return phoneRegex.test(phone.replace(/\s+/g, ''));
    }

    /**
     * Normalize phone number to E.164 format
     */
    private normalizePhoneNumber(phone: string): string {
        const cleaned = phone.replace(/\s+/g, '');
        if (cleaned.startsWith('0')) {
            return '+251' + cleaned.substring(1);
        }
        if (cleaned.startsWith('251')) {
            return '+' + cleaned;
        }
        if (cleaned.startsWith('+251')) {
            return cleaned;
        }
        throw new BadRequestException('Invalid phone number format');
    }

    /**
     * Validate email format
     */
    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}
