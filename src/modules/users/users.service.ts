import { Injectable, Logger } from '@nestjs/common';
import { UsersRepository } from '../database/repositories/users.repository';
import { User, CreateUserData, UpdateUserData } from '../database/entities/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly usersRepository: UsersRepository) { }

  async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.usersRepository.findByEmail(email);
    } catch (error) {
      this.logger.error(`Error finding user by email ${email}:`, error);
      throw error;
    }
  }

  async findByPhone(phoneNumber: string): Promise<User | null> {
    try {
      return await this.usersRepository.findByPhone(phoneNumber);
    } catch (error) {
      this.logger.error(`Error finding user by phone ${phoneNumber}:`, error);
      throw error;
    }
  }

  async create(userData: CreateUserData): Promise<User> {
    try {
      // Ensure we have the required phone format
      if (userData.phone_number && !userData.phone_number.startsWith('+251')) {
        throw new Error('Phone number must be in E164 format (+251...)');
      }

      return await this.usersRepository.create(userData);
    } catch (error) {
      this.logger.error('Error creating user:', error);
      throw error;
    }
  }

  async findById(id: string): Promise<User | null> {
    try {
      return await this.usersRepository.findById(id);
    } catch (error) {
      this.logger.error(`Error finding user by ID ${id}:`, error);
      throw error;
    }
  }

  async findAll(): Promise<User[]> {
    try {
      return await this.usersRepository.findAll();
    } catch (error) {
      this.logger.error('Error finding all users:', error);
      throw error;
    }
  }

  async updateById(id: string, updateData: UpdateUserData): Promise<User | null> {
    try {
      return await this.usersRepository.update(id, updateData);
    } catch (error) {
      this.logger.error(`Error updating user ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create or update user (useful for syncing with Supabase Auth)
   */
  async upsertUser(userData: CreateUserData): Promise<User> {
    try {
      return await this.usersRepository.upsert(userData);
    } catch (error) {
      this.logger.error('Error upserting user:', error);
      throw error;
    }
  }

  /**
   * Check if phone number is already registered
   */
  async isPhoneRegistered(phoneE164: string): Promise<boolean> {
    try {
      return await this.usersRepository.existsByPhone(phoneE164);
    } catch (error) {
      this.logger.error(`Error checking phone registration ${phoneE164}:`, error);
      throw error;
    }
  }

  /**
   * Update user's last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    try {
      await this.usersRepository.updateLastLogin(id);
    } catch (error) {
      this.logger.error(`Error updating last login for user ${id}:`, error);
      throw error;
    }
  }

  /**
   * Legacy method for backward compatibility
   * Maps new User entity to old format expected by existing code
   */
  private mapUserToLegacyFormat(user: User): any {
    return {
      _id: user.id,
      id: user.id,
      email: user.email,
      phoneNumber: user.phone_number,
      name: user.full_name,
      role: 'driver', // Default role for now
      status: user.status,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  /**
   * Legacy findById that returns old format
   * TODO: Remove this once all consumers are updated
   */
  async findByIdLegacy(id: string): Promise<any | null> {
    const user = await this.findById(id);
    return user ? this.mapUserToLegacyFormat(user) : null;
  }
}
