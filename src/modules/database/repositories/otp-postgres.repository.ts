import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from '../postgres.service';
import { BaseRepository } from '../interfaces/base-repository.interface';
import { OtpCode, CreateOtpCodeData, UpdateOtpCodeData } from '../entities/otp.entity';

@Injectable()
export class OtpPostgresRepository implements BaseRepository<OtpCode, CreateOtpCodeData, UpdateOtpCodeData> {
    private readonly logger = new Logger(OtpPostgresRepository.name);

    constructor(private readonly postgresService: PostgresService) { }

    async findById(id: string): Promise<OtpCode | null> {
        try {
            const query = 'SELECT * FROM otp_codes WHERE id = $1';
            const result = await this.postgresService.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            this.logger.error(`Error finding OTP by ID ${id}:`, error);
            throw error;
        }
    }

    async findMany(filters?: Partial<OtpCode>): Promise<OtpCode[]> {
        try {
            let query = 'SELECT * FROM otp_codes';
            const params: any[] = [];
            let paramCount = 0;

            if (filters && Object.keys(filters).length > 0) {
                const conditions: string[] = [];

                if (filters.phone_number) {
                    paramCount++;
                    conditions.push(`phone_number = $${paramCount}`);
                    params.push(filters.phone_number);
                }

                if (filters.purpose) {
                    paramCount++;
                    conditions.push(`purpose = $${paramCount}`);
                    params.push(filters.purpose);
                }

                if (filters.is_used !== undefined) {
                    paramCount++;
                    conditions.push(`is_used = $${paramCount}`);
                    params.push(filters.is_used);
                }

                if (conditions.length > 0) {
                    query += ' WHERE ' + conditions.join(' AND ');
                }
            }

            query += ' ORDER BY created_at DESC';

            const result = await this.postgresService.query(query, params);
            return result.rows;
        } catch (error) {
            this.logger.error('Error finding OTPs:', error);
            throw error;
        }
    }

    async create(data: CreateOtpCodeData): Promise<OtpCode> {
        try {
            const query = `
                INSERT INTO otp_codes (
                    phone_number, code_hash, purpose, expires_at, 
                    max_attempts, device_id, ip_address
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;

            const params = [
                data.phone_number,
                data.code_hash,
                data.purpose,
                data.expires_at,
                data.max_attempts || 3,
                data.device_id || null,
                data.ip_address || null
            ];

            const result = await this.postgresService.query(query, params);
            const otpCode = result.rows[0];

            this.logger.log(`✅ OTP code created successfully: ${otpCode.id} for ${data.phone_number}`);
            return otpCode;
        } catch (error) {
            this.logger.error('Error creating OTP:', error);
            throw error;
        }
    }

    async update(id: string, data: UpdateOtpCodeData): Promise<OtpCode | null> {
        try {
            const fields: string[] = [];
            const params: any[] = [];
            let paramCount = 0;

            if (data.attempts !== undefined) {
                paramCount++;
                fields.push(`attempts = $${paramCount}`);
                params.push(data.attempts);
            }

            if (data.is_used !== undefined) {
                paramCount++;
                fields.push(`is_used = $${paramCount}`);
                params.push(data.is_used);
            }

            if (data.used_at !== undefined) {
                paramCount++;
                fields.push(`used_at = $${paramCount}`);
                params.push(data.used_at);
            }

            if (fields.length === 0) {
                return await this.findById(id);
            }

            paramCount++;
            fields.push(`updated_at = $${paramCount}`);
            params.push(new Date().toISOString());

            paramCount++;
            params.push(id);

            const query = `
                UPDATE otp_codes 
                SET ${fields.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await this.postgresService.query(query, params);
            return result.rows[0] || null;
        } catch (error) {
            this.logger.error(`Error updating OTP ${id}:`, error);
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const query = 'DELETE FROM otp_codes WHERE id = $1';
            const result = await this.postgresService.query(query, [id]);
            return result.rowCount > 0;
        } catch (error) {
            this.logger.error(`Error deleting OTP ${id}:`, error);
            throw error;
        }
    }

    async findByPhoneAndPurpose(phoneNumber: string, purpose: string): Promise<OtpCode | null> {
        try {
            const query = `
                SELECT * FROM otp_codes 
                WHERE phone_number = $1 AND purpose = $2 
                ORDER BY created_at DESC 
                LIMIT 1
            `;
            const result = await this.postgresService.query(query, [phoneNumber, purpose]);
            return result.rows[0] || null;
        } catch (error) {
            this.logger.error(`Error finding OTP by phone and purpose:`, error);
            throw error;
        }
    }

    async deleteAllForPhoneAndPurpose(phoneNumber: string, purpose: string): Promise<number> {
        try {
            const query = 'DELETE FROM otp_codes WHERE phone_number = $1 AND purpose = $2';
            const result = await this.postgresService.query(query, [phoneNumber, purpose]);
            return result.rowCount;
        } catch (error) {
            this.logger.error(`Error deleting OTPs for phone and purpose:`, error);
            throw error;
        }
    }

    async findValidOtp(phoneNumber: string, purpose: string): Promise<OtpCode | null> {
        try {
            const query = `
                SELECT * FROM otp_codes 
                WHERE phone_number = $1 
                AND purpose = $2 
                AND is_used = false 
                AND expires_at > NOW()
                ORDER BY created_at DESC 
                LIMIT 1
            `;
            const result = await this.postgresService.query(query, [phoneNumber, purpose]);
            return result.rows[0] || null;
        } catch (error) {
            this.logger.error(`Error finding valid OTP:`, error);
            throw error;
        }
    }

    async incrementAttempts(id: string): Promise<OtpCode | null> {
        try {
            const query = `
                UPDATE otp_codes 
                SET attempts = attempts + 1, updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;
            const result = await this.postgresService.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            this.logger.error(`Error incrementing attempts for OTP ${id}:`, error);
            throw error;
        }
    }

    async markAsUsed(id: string): Promise<OtpCode | null> {
        try {
            const query = `
                UPDATE otp_codes 
                SET is_used = true, used_at = NOW(), updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;
            const result = await this.postgresService.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            this.logger.error(`Error marking OTP as used ${id}:`, error);
            throw error;
        }
    }

    async cleanupExpiredOtps(): Promise<number> {
        try {
            const query = 'DELETE FROM otp_codes WHERE expires_at < NOW()';
            const result = await this.postgresService.query(query);
            return result.rowCount;
        } catch (error) {
            this.logger.error('Error cleaning up expired OTPs:', error);
            throw error;
        }
    }

    async getOtpStats(): Promise<{
        total: number;
        used: number;
        expired: number;
        active: number;
        byPurpose: Record<string, number>;
    }> {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN is_used = true THEN 1 END) as used,
                    COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired,
                    COUNT(CASE WHEN is_used = false AND expires_at > NOW() THEN 1 END) as active
                FROM otp_codes
            `;

            const purposeQuery = `
                SELECT purpose, COUNT(*) as count
                FROM otp_codes
                GROUP BY purpose
            `;

            const [result, purposeResult] = await Promise.all([
                this.postgresService.query(query),
                this.postgresService.query(purposeQuery)
            ]);

            const stats = result.rows[0];
            const byPurpose: Record<string, number> = {};

            purposeResult.rows.forEach(row => {
                byPurpose[row.purpose] = parseInt(row.count);
            });

            return {
                ...stats,
                byPurpose
            };
        } catch (error) {
            this.logger.error('Error getting OTP stats:', error);
            throw error;
        }
    }
}
