import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersPostgresRepository } from '../database/repositories/users-postgres.repository';
import { PostgresService } from '../database/postgres.service';

export interface AuthResult {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        phoneNumber: string;
        email: string | null;
        name: string | null;
        userType: string;
        status: string;
        isPhoneVerified: boolean;
        isEmailVerified: boolean;
    };
    redirectTo: string;
}

@Injectable()
export class SimpleAuthService {
    private readonly logger = new Logger(SimpleAuthService.name);

    constructor(
        private readonly usersRepository: UsersPostgresRepository,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly postgresService: PostgresService,
    ) { }

    async authenticateUserByPhone(phoneE164: string): Promise<AuthResult> {
        this.logger.log(`🔍 Authenticating user by phone: ${phoneE164}`);

        try {
            // Find existing user
            let user = await this.usersRepository.findByPhone(phoneE164);

            if (!user) {
                // New user - create basic user record
                this.logger.log(`👤 Creating new user for: ${phoneE164}`);
                user = await this.usersRepository.create({
                    phone_number: phoneE164,
                    user_type: 'driver',
                    is_phone_verified: true,
                    is_active: true,
                    status: 'pending_verification',
                });

                // New user should go to registration
                return this.generateAuthResult(user, 'register-1');
            }

            // Update last login
            await this.usersRepository.updateLastLogin(user.id);

            // Determine redirect based on driver profile status
            const redirectTo = await this.determineRedirection(user.id);

            this.logger.log(`✅ User authenticated: ${user.id}, redirecting to: ${redirectTo}`);

            return this.generateAuthResult(user, redirectTo);

        } catch (error) {
            this.logger.error(`❌ Authentication failed for ${phoneE164}:`, error);
            throw error;
        }
    }

    private async determineRedirection(userId: string): Promise<string> {
        try {
            // Check if user has a driver profile
            const query = `
                SELECT verification_status 
                FROM driver_profiles 
                WHERE user_id = $1
            `;

            const result = await this.postgresService.query(query, [userId]);

            if (result.rows.length === 0) {
                // No driver profile - needs to register
                this.logger.log(`📝 No driver profile found for user: ${userId}, redirecting to register-1`);
                return 'register-1';
            }

            const verificationStatus = result.rows[0].verification_status;
            this.logger.log(`📊 Driver profile status: ${verificationStatus}`);

            if (verificationStatus === 'verified') {
                return 'Home';
            } else {
                // pending_review, unverified, rejected, etc.
                return 'pending-verification';
            }

        } catch (error) {
            this.logger.error(`❌ Error determining redirection for user ${userId}:`, error);
            // Default to registration if we can't determine status
            return 'register-1';
        }
    }

    private generateAuthResult(user: any, redirectTo: string): AuthResult {
        // Generate tokens
        const payload = {
            sub: user.id,
            phoneNumber: user.phone_number,
            email: user.email,
            userType: user.user_type
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
            redirectTo,
        };
    }
}
