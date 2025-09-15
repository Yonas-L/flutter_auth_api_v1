import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { User, CreateUserData, UpdateUserData } from '../entities/user.entity';
import { BaseRepository } from '../interfaces/base-repository.interface';

@Injectable()
export class UsersRepository implements BaseRepository<User, CreateUserData, UpdateUserData> {
    private readonly logger = new Logger(UsersRepository.name);

    constructor(private readonly databaseService: DatabaseService) { }

    async findById(id: string): Promise<User | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('users')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find user by ID ${id}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            this.logger.error(`Error finding user by ID ${id}:`, error);
            throw error;
        }
    }

    async findByEmail(email: string): Promise<User | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('users')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find user by email ${email}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            this.logger.error(`Error finding user by email ${email}:`, error);
            throw error;
        }
    }

    async findAll(): Promise<User[]> {
        try {
            const { data, error } = await this.databaseService.client
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                this.logger.error('Failed to find all users:', error);
                throw error;
            }

            return data || [];
        } catch (error) {
            this.logger.error('Error finding all users:', error);
            throw error;
        }
    }

    async findByPhone(phoneE164: string): Promise<User | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('users')
                .select('*')
                .eq('phone_number', phoneE164)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find user by phone ${phoneE164}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            this.logger.error(`Error finding user by phone ${phoneE164}:`, error);
            throw error;
        }
    }

    async findMany(filters?: Partial<User>): Promise<User[]> {
        try {
            let query = this.databaseService.client.from('users').select('*');

            if (filters) {
                Object.entries(filters).forEach(([key, value]) => {
                    if (value !== undefined) {
                        query = query.eq(key, value);
                    }
                });
            }

            const { data, error } = await query;

            if (error) {
                this.logger.error('Failed to find users:', error);
                throw error;
            }

            return data || [];
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

            const { data, error } = await this.databaseService.client
                .from('users')
                .insert(createData)
                .select()
                .single();

            if (error) {
                this.logger.error('Failed to create user:', error);
                throw error;
            }

            this.logger.log(`✅ User created successfully: ${data.id}`);
            return data;
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

            const { data, error } = await this.databaseService.client
                .from('users')
                .update(dataToUpdate)
                .eq('id', id)
                .select()
                .single();

            if (error) {
                this.logger.error(`Failed to update user ${id}:`, error);
                throw error;
            }

            this.logger.log(`✅ User updated successfully: ${id}`);
            return data;
        } catch (error) {
            this.logger.error(`Error updating user ${id}:`, error);
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            // Soft delete by setting deleted_at timestamp
            const { error } = await this.databaseService.client
                .from('users')
                .update({
                    deleted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id);

            if (error) {
                this.logger.error(`Failed to delete user ${id}:`, error);
                throw error;
            }

            this.logger.log(`✅ User soft deleted successfully: ${id}`);
            return true;
        } catch (error) {
            this.logger.error(`Error deleting user ${id}:`, error);
            throw error;
        }
    }

    /**
     * Create or update user (upsert operation)
     * Useful for syncing with Supabase Auth users
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
    async existsByPhone(phoneE164: string): Promise<boolean> {
        try {
            const { data, error } = await this.databaseService.client
                .from('users')
                .select('id')
                .eq('phone_e164', phoneE164)
                .limit(1);

            if (error) {
                this.logger.error(`Failed to check user existence by phone ${phoneE164}:`, error);
                throw error;
            }

            return (data?.length ?? 0) > 0;
        } catch (error) {
            this.logger.error(`Error checking user existence by phone ${phoneE164}:`, error);
            throw error;
        }
    }

    /**
     * Update last login timestamp
     */
    async updateLastLogin(id: string): Promise<void> {
        try {
            const { error } = await this.databaseService.client
                .from('users')
                .update({
                    last_login_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id);

            if (error) {
                this.logger.error(`Failed to update last login for user ${id}:`, error);
                throw error;
            }

            this.logger.log(`✅ Last login updated for user: ${id}`);
        } catch (error) {
            this.logger.error(`Error updating last login for user ${id}:`, error);
            throw error;
        }
    }
}
