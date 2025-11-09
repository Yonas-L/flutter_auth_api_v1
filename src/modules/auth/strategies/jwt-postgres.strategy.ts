import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersPostgresRepository } from '../../database/repositories/users-postgres.repository';

@Injectable()
export class JwtPostgresStrategy extends PassportStrategy(Strategy, 'jwt-postgres') {
    private readonly logger = new Logger(JwtPostgresStrategy.name);

    constructor(
        private configService: ConfigService,
        private usersRepository: UsersPostgresRepository,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_ACCESS_SECRET')
                || configService.get('JWT_SECRET')
                || 'fallback-secret',
        });
    }

    async validate(payload: any) {
        try {
            this.logger.log(`🔐 Validating JWT token for user: ${payload.sub}`);

            // Extract user ID from payload
            const userId = payload.sub || payload.id;
            if (!userId) {
                throw new UnauthorizedException('Invalid token: missing user ID');
            }

            // Find user in our PostgreSQL database
            const user = await this.usersRepository.findById(userId);
            if (!user) {
                this.logger.warn(`❌ User not found: ${userId}`);
                throw new UnauthorizedException('User not found');
            }

            // Check if user is active
            if (!user.is_active) {
                this.logger.warn(`❌ User account deactivated: ${userId}`);
                throw new UnauthorizedException('User account is deactivated');
            }

            // Check account_status for deactivation
            if ((user as any).account_status === 'deactivated') {
                this.logger.warn(`❌ User account status is deactivated: ${userId}`);
                const deactivationReason = (user as any).deactivation_reason || 'Account has been deactivated';
                throw new UnauthorizedException(`Your account has been deactivated. Please contact the office. Reason: ${deactivationReason}`);
            }

            // Check if user is verified (optional - you might want to allow unverified users)
            if (user.status === 'deleted') {
                this.logger.warn(`❌ User account deleted: ${userId}`);
                throw new UnauthorizedException('User account has been deleted');
            }

            this.logger.log(`✅ JWT token validated for user: ${userId}`);

            // Return user data in format expected by auth guards
            return {
                id: user.id,
                phoneNumber: user.phone_number,
                email: user.email,
                name: user.display_name,
                userType: user.user_type,
                status: user.status,
                isPhoneVerified: user.is_phone_verified,
                isEmailVerified: user.is_email_verified,
                // Legacy fields for backward compatibility
                role: user.user_type === 'admin' ? 'admin' : 'driver', // Default role mapping
            };
        } catch (error) {
            this.logger.error(`❌ JWT validation error:`, error);
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException('Token validation failed');
        }
    }
}

