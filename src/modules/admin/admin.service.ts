import { Injectable } from '@nestjs/common';
import { UsersPostgresRepository } from '../database/repositories/users-postgres.repository';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AdminService {
    constructor(
        private readonly usersRepository: UsersPostgresRepository,
        private readonly mailService: MailService,
    ) { }

    async createUser(email: string, fullName: string, userType: 'admin' | 'customer_support') {
        // Generate temporary password
        const tempPassword = this.generateTempPassword();

        // Create user
        const user = await this.usersRepository.create({
            email,
            full_name: fullName,
            user_type: userType,
            password_hash: tempPassword, // In production, hash this
            is_active: true,
            status: 'pending_verification',
        });

        // Get role ID
        const roleId = await this.getRoleId(userType);

        // Assign role
        await this.assignRoleToUser(user.id, roleId);

        // Set password expiration
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await this.usersRepository.update(user.id, {
            temp_password_expires_at: expiresAt,
            must_change_password: true,
        });

        // Send email
        await this.mailService.sendUserCreationEmail(
            email,
            fullName,
            tempPassword,
            userType,
        );

        return {
            success: true,
            user_id: user.id,
            email: user.email,
            full_name: user.full_name,
            user_type: user.user_type,
            status: user.status,
            temp_password: tempPassword,
            created_at: user.created_at,
            expires_at: expiresAt.toISOString(),
        };
    }

    async changePassword(email: string, tempPassword: string, newPassword: string) {
        const user = await this.usersRepository.findByEmail(email);

        if (!user) {
            throw new Error('User not found');
        }

        if (user.password_hash !== tempPassword) {
            throw new Error('Invalid temporary password');
        }

        if (user.temp_password_expires_at && new Date() > new Date(user.temp_password_expires_at)) {
            throw new Error('Temporary password has expired');
        }

        if (!user.must_change_password) {
            throw new Error('Password change not required for this user');
        }

        await this.usersRepository.update(user.id, {
            password_hash: newPassword, // In production, hash this
            must_change_password: false,
            temp_password_expires_at: null,
            status: 'verified',
        });

        return {
            success: true,
            message: 'Password changed successfully',
            user_id: user.id,
        };
    }

    private generateTempPassword(): string {
        return Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
    }

    private async getRoleId(roleName: string): Promise<string> {
        const query = 'SELECT id FROM roles WHERE name = $1 AND is_active = true';
        const result = await this.usersRepository.query(query, [roleName]);
        return result.rows[0]?.id;
    }

    private async assignRoleToUser(userId: string, roleId: string): Promise<void> {
        const query = 'INSERT INTO user_roles (user_id, role_id, created_at) VALUES ($1, $2, NOW())';
        await this.usersRepository.query(query, [userId, roleId]);
    }
}
