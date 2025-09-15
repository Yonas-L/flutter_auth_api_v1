import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from '../postgres.service';
import { User, CreateUserData, UpdateUserData } from '../entities/user.entity';
import { BasePostgresRepository } from './base-postgres.repository';

@Injectable()
export class UsersPostgresRepository extends BasePostgresRepository<User, CreateUserData, UpdateUserData> {
    protected tableName = 'users';

    constructor(postgresService: PostgresService) {
        super(postgresService);
    }

    async findByPhone(phoneNumber: string): Promise<User | null> {
        try {
            const query = `SELECT * FROM ${this.tableName} WHERE phone_number = $1`;
            const result = await this.query(query, [phoneNumber]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0] as User;
        } catch (error) {
            this.logger.error(`Error finding user by phone ${phoneNumber}:`, error);
            throw error;
        }
    }

    async findByEmail(email: string): Promise<User | null> {
        try {
            const query = `SELECT * FROM ${this.tableName} WHERE email = $1`;
            const result = await this.query(query, [email]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0] as User;
        } catch (error) {
            this.logger.error(`Error finding user by email ${email}:`, error);
            throw error;
        }
    }

    async findByUserType(userType: 'passenger' | 'driver' | 'admin'): Promise<User[]> {
        try {
            const query = `SELECT * FROM ${this.tableName} WHERE user_type = $1 ORDER BY created_at DESC`;
            const result = await this.query(query, [userType]);

            return result.rows as User[];
        } catch (error) {
            this.logger.error(`Error finding users by type ${userType}:`, error);
            throw error;
        }
    }

    async findActiveUsers(): Promise<User[]> {
        try {
            const query = `SELECT * FROM ${this.tableName} WHERE is_active = true ORDER BY created_at DESC`;
            const result = await this.query(query);

            return result.rows as User[];
        } catch (error) {
            this.logger.error('Error finding active users:', error);
            throw error;
        }
    }

    async findVerifiedUsers(): Promise<User[]> {
        try {
            const query = `SELECT * FROM ${this.tableName} WHERE status = 'verified' ORDER BY created_at DESC`;
            const result = await this.query(query);

            return result.rows as User[];
        } catch (error) {
            this.logger.error('Error finding verified users:', error);
            throw error;
        }
    }

    async updateLastLogin(id: string): Promise<User | null> {
        try {
            const query = `
                UPDATE ${this.tableName}
                SET last_login_at = NOW(), updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;
            const result = await this.query(query, [id]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0] as User;
        } catch (error) {
            this.logger.error(`Error updating last login for user ${id}:`, error);
            throw error;
        }
    }

    async softDelete(id: string): Promise<boolean> {
        try {
            const query = `
                UPDATE ${this.tableName}
                SET deleted_at = NOW(), is_active = false, updated_at = NOW()
                WHERE id = $1
            `;
            const result = await this.query(query, [id]);

            return result.rowCount > 0;
        } catch (error) {
            this.logger.error(`Error soft deleting user ${id}:`, error);
            throw error;
        }
    }

    async restore(id: string): Promise<User | null> {
        try {
            const query = `
                UPDATE ${this.tableName}
                SET deleted_at = NULL, is_active = true, updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;
            const result = await this.query(query, [id]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0] as User;
        } catch (error) {
            this.logger.error(`Error restoring user ${id}:`, error);
            throw error;
        }
    }

    async updateOTP(id: string, otp: string, expiresAt: Date): Promise<User | null> {
        try {
            const query = `
                UPDATE ${this.tableName}
                SET otp = $2, otp_expires_at = $3, updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;
            const result = await this.query(query, [id, otp, expiresAt.toISOString()]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0] as User;
        } catch (error) {
            this.logger.error(`Error updating OTP for user ${id}:`, error);
            throw error;
        }
    }

    async clearOTP(id: string): Promise<User | null> {
        try {
            const query = `
                UPDATE ${this.tableName}
                SET otp = NULL, otp_expires_at = NULL, updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;
            const result = await this.query(query, [id]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0] as User;
        } catch (error) {
            this.logger.error(`Error clearing OTP for user ${id}:`, error);
            throw error;
        }
    }

    /**
     * Create or update user (upsert operation)
     * Useful for syncing with external auth systems
     */
    async upsert(userData: CreateUserData): Promise<User> {
        try {
            this.logger.log(`Upserting user with data: ${JSON.stringify(userData)}`);

            // First, try to find existing user by ID (if provided), phone, or email
            let existingUser: User | null = null;

            // Check by ID first (most specific)
            if (userData.id) {
                existingUser = await this.findById(userData.id);
                this.logger.log(`Found user by ID ${userData.id}: ${!!existingUser}`);
            }

            // If not found by ID, check by phone
            if (!existingUser && userData.phone_e164) {
                existingUser = await this.findByPhone(userData.phone_e164);
                this.logger.log(`Found user by phone ${userData.phone_e164}: ${!!existingUser}`);
            }

            // If still not found, check by email
            if (!existingUser && userData.email) {
                existingUser = await this.findByEmail(userData.email);
                this.logger.log(`Found user by email ${userData.email}: ${!!existingUser}`);
            }

            if (existingUser) {
                // Update existing user - use the existing user's ID
                this.logger.log(`Updating existing user: ${existingUser.id}`);
                const updateData = { ...userData };
                delete updateData.id; // Don't try to update the ID

                const updatedUser = await this.update(existingUser.id, updateData);
                if (!updatedUser) {
                    throw new Error('Failed to update existing user');
                }
                return updatedUser;
            } else {
                // Create new user
                this.logger.log(`Creating new user with ID: ${userData.id}`);
                return await this.create(userData);
            }
        } catch (error) {
            this.logger.error('Error upserting user:', error);
            throw error;
        }
    }

    /**
     * Get user statistics
     */
    async getUserStats(): Promise<{
        total: number;
        active: number;
        verified: number;
        byType: { [key: string]: number };
    }> {
        try {
            const totalQuery = `SELECT COUNT(*) as total FROM ${this.tableName}`;
            const activeQuery = `SELECT COUNT(*) as active FROM ${this.tableName} WHERE is_active = true`;
            const verifiedQuery = `SELECT COUNT(*) as verified FROM ${this.tableName} WHERE status = 'verified'`;
            const typeQuery = `
                SELECT user_type, COUNT(*) as count 
                FROM ${this.tableName} 
                GROUP BY user_type
            `;

            const [totalResult, activeResult, verifiedResult, typeResult] = await Promise.all([
                this.query(totalQuery),
                this.query(activeQuery),
                this.query(verifiedQuery),
                this.query(typeQuery)
            ]);

            const byType = typeResult.rows.reduce((acc: any, row: any) => {
                acc[row.user_type] = parseInt(row.count);
                return acc;
            }, {});

            return {
                total: parseInt(totalResult.rows[0].total),
                active: parseInt(activeResult.rows[0].active),
                verified: parseInt(verifiedResult.rows[0].verified),
                byType
            };
        } catch (error) {
            this.logger.error('Error getting user stats:', error);
            throw error;
        }
    }
}
