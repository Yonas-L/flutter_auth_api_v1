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
            // Test database connection first
            this.logger.log(`🔗 Testing database connection...`);
            const testQuery = await this.postgresService.query('SELECT 1 as test');
            this.logger.log(`✅ Database connection successful: ${JSON.stringify(testQuery.rows)}`);

            // Find existing user
            this.logger.log(`🔍 Looking for existing user with phone: ${phoneE164}`);
            let user = await this.usersRepository.findByPhone(phoneE164);
            this.logger.log(`👤 User lookup result: ${user ? `Found user ${user.id}` : 'No existing user found'}`);

            if (!user) {
                // New user - create basic user record
                this.logger.log(`👤 Creating new user for: ${phoneE164}`);
                try {
                    user = await this.usersRepository.create({
                        phone_number: phoneE164,
                        user_type: 'driver',
                        is_phone_verified: true,
                        is_active: true,
                        status: 'pending_verification',
                    });
                    this.logger.log(`✅ User created successfully: ${user.id} for phone: ${phoneE164}`);
                } catch (createError) {
                    this.logger.error(`❌ Failed to create user for ${phoneE164}:`, createError);
                    throw new Error(`Failed to create user: ${createError.message}`);
                }

                // New user should go to registration
                return this.generateAuthResult(user, 'register-1');
            }

            // Check if user account is deactivated - fetch full user data with account_status
            const userWithStatus = await this.postgresService.query(
                `SELECT account_status, deactivation_reason, is_active FROM users WHERE id = $1`,
                [user.id]
            );
            
            if (userWithStatus.rows.length > 0) {
                const accountStatus = userWithStatus.rows[0].account_status;
                const deactivationReason = userWithStatus.rows[0].deactivation_reason;
                const isActive = userWithStatus.rows[0].is_active;
                
                // Update user object with account_status and deactivation_reason
                (user as any).account_status = accountStatus;
                (user as any).deactivation_reason = deactivationReason;
                
                // If account is deactivated, redirect to deactivated screen instead of throwing error
                if (accountStatus === 'deactivated' || !isActive) {
                    this.logger.warn(`❌ Login attempt for deactivated account: ${user.id}`);
                    // Don't throw error - instead return user with redirectTo set to account-deactivated
                    // This allows the frontend to show the deactivated screen
                    return await this.generateAuthResult(user, 'account-deactivated');
                }
            }

            // Update last login
            await this.usersRepository.updateLastLogin(user.id);

            // Determine redirect based on driver profile status
            const redirectTo = await this.determineRedirection(user.id);

            this.logger.log(`✅ User authenticated: ${user.id}, redirecting to: ${redirectTo}`);

            return await this.generateAuthResult(user, redirectTo);

        } catch (error) {
            this.logger.error(`❌ Authentication failed for ${phoneE164}:`, error);
            throw error;
        }
    }

    async authenticateUserByEmail(email: string): Promise<AuthResult> {
        this.logger.log(`🔍 Authenticating user by email: ${email}`);

        try {
            // Find existing user by email
            this.logger.log(`🔍 Looking for existing user with email: ${email}`);
            let user = await this.usersRepository.findByEmail(email.toLowerCase());
            this.logger.log(`👤 User lookup result: ${user ? `Found user ${user.id}` : 'No existing user found'}`);

            if (!user) {
                // New user - create basic user record with email
                this.logger.log(`👤 Creating new user for email: ${email}`);
                try {
                    user = await this.usersRepository.create({
                        email: email.toLowerCase(),
                        user_type: 'driver',
                        is_email_verified: true,
                        is_active: true,
                        status: 'pending_verification',
                    });
                    this.logger.log(`✅ User created successfully: ${user.id} for email: ${email}`);
                } catch (createError) {
                    this.logger.error(`❌ Failed to create user for ${email}:`, createError);
                    throw new Error(`Failed to create user: ${createError.message}`);
                }

                // New user should go to registration
                return await this.generateAuthResult(user, 'register-1');
            }

            // Check if user account is deactivated - fetch full user data with account_status
            const userWithStatus = await this.postgresService.query(
                `SELECT account_status, deactivation_reason, is_active FROM users WHERE id = $1`,
                [user.id]
            );
            
            if (userWithStatus.rows.length > 0) {
                const accountStatus = userWithStatus.rows[0].account_status;
                const deactivationReason = userWithStatus.rows[0].deactivation_reason;
                const isActive = userWithStatus.rows[0].is_active;
                
                // Update user object with account_status and deactivation_reason
                (user as any).account_status = accountStatus;
                (user as any).deactivation_reason = deactivationReason;
                
                // If account is deactivated, redirect to deactivated screen instead of throwing error
                if (accountStatus === 'deactivated' || !isActive) {
                    this.logger.warn(`❌ Login attempt for deactivated account: ${user.id}`);
                    // Don't throw error - instead return user with redirectTo set to account-deactivated
                    // This allows the frontend to show the deactivated screen
                    return await this.generateAuthResult(user, 'account-deactivated');
                }
            }

            // Update last login
            await this.usersRepository.updateLastLogin(user.id);

            // Determine redirect based on driver profile status
            const redirectTo = await this.determineRedirection(user.id);

            this.logger.log(`✅ User authenticated: ${user.id}, redirecting to: ${redirectTo}`);

            return await this.generateAuthResult(user, redirectTo);

        } catch (error) {
            this.logger.error(`❌ Authentication failed for ${email}:`, error);
            throw error;
        }
    }

    private async determineRedirection(userId: string): Promise<string> {
        try {
            // First check the user's status from the users table
            const userQuery = `SELECT status FROM users WHERE id = $1`;
            const userResult = await this.postgresService.query(userQuery, [userId]);

            if (userResult.rows.length === 0) {
                this.logger.log(`📝 User not found: ${userId}, redirecting to register-1`);
                return 'register-1';
            }

            const userStatus = userResult.rows[0].status;
            this.logger.log(`📊 User status for ${userId}: ${userStatus}`);

            // Check user status first - this is the primary decision factor
            if (userStatus === 'verified' || userStatus === 'active') {
                this.logger.log(`✅ User ${userId} is verified/active, redirecting to Home`);
                return 'Home';
            } else if (userStatus === 'pending_verification') {
                // Check if user has complete registration (profile + vehicle + documents)
                // Also check for rejected documents that need re-upload
                const registrationQuery = `
                    SELECT 
                        dp.id as driver_profile_id,
                        dp.verification_status as driver_verification_status,
                        v.id as vehicle_id,
                        COUNT(d.id) as document_count,
                        COUNT(CASE WHEN d.verification_status = 'rejected' THEN 1 END) as rejected_documents_count,
                        COUNT(CASE WHEN d.verification_status = 'pending_review' THEN 1 END) as pending_documents_count
                    FROM users u
                    LEFT JOIN driver_profiles dp ON u.id = dp.user_id
                    LEFT JOIN vehicles v ON dp.id = v.driver_id
                    LEFT JOIN documents d ON u.id = d.user_id AND d.doc_type IN ('driver_license', 'vehicle_registration', 'insurance')
                    WHERE u.id = $1
                    GROUP BY dp.id, dp.verification_status, v.id
                `;

                const regResult = await this.postgresService.query(registrationQuery, [userId]);
                const row = regResult.rows[0];
                const hasProfile = !!row.driver_profile_id;
                const hasVehicle = !!row.vehicle_id;
                const hasDocuments = parseInt(row.document_count) > 0;
                const rejectedDocuments = parseInt(row.rejected_documents_count) > 0;
                const pendingDocuments = parseInt(row.pending_documents_count) > 0;
                const driverVerificationStatus = row.driver_verification_status;

                this.logger.log(`📊 Registration status - Profile: ${hasProfile}, Vehicle: ${hasVehicle}, Documents: ${hasDocuments}, Rejected: ${rejectedDocuments}, Pending: ${pendingDocuments}, Driver Status: ${driverVerificationStatus}`);

                // If no driver profile, user needs to start registration
                if (!hasProfile) {
                    this.logger.log(`📝 No driver profile found for user: ${userId}, redirecting to register-1`);
                    return 'register-1';
                }

                // If profile exists but not complete (missing vehicle or documents), continue registration
                if (!hasVehicle || !hasDocuments) {
                    this.logger.log(`📝 Incomplete registration for user: ${userId}, redirecting to register-1`);
                    return 'register-1';
                }

                // Check for rejected documents - redirect to document re-upload
                if (rejectedDocuments || driverVerificationStatus === 'rejected') {
                    this.logger.log(`❌ User ${userId} has rejected documents or driver status is rejected, redirecting to register-3 for re-upload`);
                    return 'register-3';
                }

                // Check for pending documents - redirect to pending screen (not re-upload)
                if (pendingDocuments || driverVerificationStatus === 'pending_review') {
                    this.logger.log(`⏳ User ${userId} has pending documents or driver status is pending_review, redirecting to pending-verification`);
                    return 'pending-verification';
                }

                // Profile is complete and user is pending verification
                this.logger.log(`⏳ User ${userId} has complete profile but pending verification, redirecting to pending-verification`);
                return 'pending-verification';
            } else if (userStatus === 'suspended' || userStatus === 'deleted') {
                this.logger.log(`❌ User ${userId} is suspended/deleted, redirecting to register-1`);
                return 'register-1';
            } else {
                // Unknown status, check registration completeness
                this.logger.log(`⚠️ Unknown user status: ${userStatus}, checking registration completeness`);

                const registrationQuery = `
                    SELECT 
                        dp.id as driver_profile_id,
                        dp.verification_status as driver_verification_status,
                        v.id as vehicle_id,
                        COUNT(d.id) as document_count,
                        COUNT(CASE WHEN d.verification_status = 'rejected' THEN 1 END) as rejected_documents_count,
                        COUNT(CASE WHEN d.verification_status = 'pending_review' THEN 1 END) as pending_documents_count
                    FROM users u
                    LEFT JOIN driver_profiles dp ON u.id = dp.user_id
                    LEFT JOIN vehicles v ON dp.id = v.driver_id
                    LEFT JOIN documents d ON u.id = d.user_id AND d.doc_type IN ('driver_license', 'vehicle_registration', 'insurance')
                    WHERE u.id = $1
                    GROUP BY dp.id, dp.verification_status, v.id
                `;

                const regResult = await this.postgresService.query(registrationQuery, [userId]);
                const row = regResult.rows[0];
                const hasProfile = !!row.driver_profile_id;
                const hasVehicle = !!row.vehicle_id;
                const hasDocuments = parseInt(row.document_count) > 0;
                const rejectedDocuments = parseInt(row.rejected_documents_count) > 0;
                const pendingDocuments = parseInt(row.pending_documents_count) > 0;
                const driverVerificationStatus = row.driver_verification_status;

                this.logger.log(`📊 Unknown status registration check - Profile: ${hasProfile}, Vehicle: ${hasVehicle}, Documents: ${hasDocuments}, Rejected: ${rejectedDocuments}, Pending: ${pendingDocuments}, Driver Status: ${driverVerificationStatus}`);

                if (!hasProfile || !hasVehicle || !hasDocuments) {
                    this.logger.log(`📝 Incomplete registration for user: ${userId}, redirecting to register-1`);
                    return 'register-1';
                } else if (rejectedDocuments || driverVerificationStatus === 'rejected') {
                    this.logger.log(`❌ User ${userId} has rejected documents or driver status is rejected, redirecting to register-3 for re-upload`);
                    return 'register-3';
                } else if (pendingDocuments || driverVerificationStatus === 'pending_review') {
                    this.logger.log(`⏳ User ${userId} has pending documents or driver status is pending_review, redirecting to pending-verification`);
                    return 'pending-verification';
                } else {
                    this.logger.log(`⏳ User ${userId} has complete profile, redirecting to pending-verification`);
                    return 'pending-verification';
                }
            }

        } catch (error) {
            this.logger.error(`❌ Error determining redirection for user ${userId}:`, error);
            // Default to registration if we can't determine status
            return 'register-1';
        }
    }

    private async generateAuthResult(user: any, redirectTo: string): Promise<AuthResult> {
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

        // Get account_status and deactivation info
        let accountStatus = (user as any).account_status;
        let deactivationReason = (user as any).deactivation_reason;
        let flagId = null;

        // If account is deactivated, get the flag_id from the most recent active flag
        if (accountStatus === 'deactivated') {
            try {
                const flagQuery = `
                    SELECT df.id 
                    FROM driver_flags df
                    JOIN driver_profiles dp ON df.driver_id = dp.id
                    WHERE dp.user_id = $1 
                    AND df.status IN ('pending', 'under_review')
                    ORDER BY df.created_at DESC
                    LIMIT 1
                `;
                const flagResult = await this.postgresService.query(flagQuery, [user.id]);
                if (flagResult.rows.length > 0) {
                    flagId = flagResult.rows[0].id;
                }
            } catch (error) {
                this.logger.error(`Error fetching flag_id for deactivated user ${user.id}:`, error);
            }
        }

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
                account_status: accountStatus,
                deactivation_reason: deactivationReason,
                flag_id: flagId,
            },
            redirectTo,
        };
    }
}
