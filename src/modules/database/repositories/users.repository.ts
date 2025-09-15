import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from '../postgres.service';
import { User, CreateUserData, UpdateUserData } from '../entities/user.entity';
import { BaseRepository } from '../interfaces/base-repository.interface';

@Injectable()
export class UsersRepository implements BaseRepository<User, CreateUserData, UpdateUserData> {
    private readonly logger = new Logger(UsersRepository.name);
    private readonly tableName = 'users';

    constructor(private readonly postgresService: PostgresService) { }

    async findById(id: string): Promise<User | null> {
        try {
            const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
            const result = await this.postgresService.query(query, [id]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0] as User;
        } catch (error) {
            this.logger.error(`Error finding user by ID ${id}:`, error);
            throw error;
        }
    }

    async findByEmail(email: string): Promise<User | null> {
        try {
            const query = `SELECT * FROM ${this.tableName} WHERE email = $1`;
            const result = await this.postgresService.query(query, [email]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0] as User;
        } catch (error) {
            this.logger.error(`Error finding user by email ${email}:`, error);
            throw error;
        }
    }

    async findAll(): Promise<User[]> {
        try {
            const query = `SELECT * FROM ${this.tableName} ORDER BY created_at DESC`;
            const result = await this.postgresService.query(query);

            return result.rows as User[];
        } catch (error) {
            this.logger.error('Error finding all users:', error);
            throw error;
        }
    }

    async findByPhone(phoneNumber: string): Promise<User | null> {
        try {
            const query = `SELECT * FROM ${this.tableName} WHERE phone_number = $1`;
            const result = await this.postgresService.query(query, [phoneNumber]);

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0] as User;
        } catch (error) {
            this.logger.error(`Error finding user by phone ${phoneNumber}:`, error);
            throw error;
        }
    }

    async findMany(filters?: Partial<User>): Promise<User[]> {
        try {
            let query = `SELECT * FROM ${this.tableName}`;
            const params: any[] = [];
            let paramIndex = 1;

            if (filters && Object.keys(filters).length > 0) {
                const conditions: string[] = [];
                Object.entries(filters).forEach(([key, value]) => {
                    if (value !== undefined) {
                        conditions.push(`${key} = $${paramIndex}`);
                        params.push(value);
                        paramIndex++;
                    }
                });
                if (conditions.length > 0) {
                    query += ` WHERE ${conditions.join(' AND ')}`;
                }
            }

            const result = await this.postgresService.query(query, params);
            return result.rows as User[];
        } catch (error) {
            this.logger.error('Error finding users:', error);
            throw error;
        }
    }

    async create(userData: CreateUserData): Promise<User> {
        try {
            const createData = {
                ...userData,
                is_phone_verified: userData.is_phone_verified ?? false,
                is_email_verified: userData.is_email_verified ?? false,
                status: userData.status ?? 'pending_verification',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const columns = Object.keys(createData);
            const values = Object.values(createData);
            const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

            const query = `
                INSERT INTO ${this.tableName} (${columns.join(', ')})
                VALUES (${placeholders})
                RETURNING *
            `;

            const result = await this.postgresService.query(query, values);
            const user = result.rows[0] as User;

            this.logger.log(`✅ User created successfully: ${user.id}`);
            return user;
        } catch (error) {
            this.logger.error('Error creating user:', error);
            throw error;
        }
    }

    async update(id: string, updateData: UpdateUserData): Promise<User | null> {
        try {
            const dataToUpdate = {
                ...updateData,
                updated_at: new Date().toISOString(),
            };

            const columns = Object.keys(dataToUpdate);
            const values = Object.values(dataToUpdate);
            const setClause = columns.map((col, index) => `${col} = $${index + 2}`).join(', ');

            const query = `
                UPDATE ${this.tableName}
                SET ${setClause}
                WHERE id = $1
                RETURNING *
            `;

            const result = await this.postgresService.query(query, [id, ...values]);

            if (result.rows.length === 0) {
                return null;
            }

            const user = result.rows[0] as User;
            this.logger.log(`✅ User updated successfully: ${id}`);
            return user;
        } catch (error) {
            this.logger.error(`Error updating user ${id}:`, error);
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            // Soft delete by setting deleted_at timestamp
            const query = `
                UPDATE ${this.tableName}
                SET deleted_at = $1, updated_at = $2
                WHERE id = $3
            `;

            await this.postgresService.query(query, [
                new Date().toISOString(),
                new Date().toISOString(),
                id
            ]);

            this.logger.log(`✅ User soft deleted successfully: ${id}`);
            return true;
        } catch (error) {
            this.logger.error(`Error deleting user ${id}:`, error);
            throw error;
        }
    }

    /**
     * Create or update user (upsert operation)
     * Useful for syncing with authentication systems
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
            if (!existingUser && userData.phone_number) {
                existingUser = await this.findByPhone(userData.phone_number);
                this.logger.log(`Found user by phone ${userData.phone_number}: ${!!existingUser}`);
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
            this.logger.error('Error details:', {
                message: error.message,
                code: error.code,
                hint: error.hint,
                details: error.details,
            });
            throw error;
        }
    }

    /**
     * Check if user exists by phone number
     */
    async existsByPhone(phoneNumber: string): Promise<boolean> {
        try {
            const query = `SELECT id FROM ${this.tableName} WHERE phone_number = $1 LIMIT 1`;
            const result = await this.postgresService.query(query, [phoneNumber]);

            return result.rows.length > 0;
        } catch (error) {
            this.logger.error(`Error checking user existence by phone ${phoneNumber}:`, error);
            throw error;
        }
    }

    /**
     * Update last login timestamp
     */
    async updateLastLogin(id: string): Promise<void> {
        try {
            const query = `
                UPDATE ${this.tableName}
                SET last_login_at = $1, updated_at = $2
                WHERE id = $3
            `;

            await this.postgresService.query(query, [
                new Date().toISOString(),
                new Date().toISOString(),
                id
            ]);

            this.logger.log(`✅ Last login updated for user: ${id}`);
        } catch (error) {
            this.logger.error(`Error updating last login for user ${id}:`, error);
            throw error;
        }
    }
}
