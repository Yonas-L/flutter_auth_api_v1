import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from '../interfaces/base-repository.interface';
import { OtpCode, CreateOtpCodeData, UpdateOtpCodeData } from '../entities/otp.entity';

@Injectable()
export class OtpRepository implements BaseRepository<OtpCode, CreateOtpCodeData, UpdateOtpCodeData> {
    private readonly logger = new Logger(OtpRepository.name);

    constructor(private readonly databaseService: DatabaseService) { }

    async findById(id: string): Promise<OtpCode | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('otp_codes')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find OTP by ID ${id}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            this.logger.error(`Error finding OTP by ID ${id}:`, error);
            throw error;
        }
    }

    async findMany(filters?: Partial<OtpCode>): Promise<OtpCode[]> {
        try {
            let query = this.databaseService.client.from('otp_codes').select('*');

            if (filters) {
                Object.entries(filters).forEach(([key, value]) => {
                    if (value !== undefined) {
                        query = query.eq(key, value);
                    }
                });
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) {
                this.logger.error('Failed to find OTP codes:', error);
                throw error;
            }

            return data || [];
        } catch (error) {
            this.logger.error('Error finding OTP codes:', error);
            throw error;
        }
    }

    async create(data: CreateOtpCodeData): Promise<OtpCode> {
        try {
            const { data: otpCode, error } = await this.databaseService.client
                .from('otp_codes')
                .insert([{
                    ...data,
                    purpose: data.purpose || 'registration',
                    max_attempts: data.max_attempts || 3,
                }])
                .select()
                .single();

            if (error) {
                this.logger.error('Failed to create OTP code:', error);
                throw error;
            }

            this.logger.log(`✅ OTP code created successfully: ${otpCode.id} for ${data.phone_e164}`);
            return otpCode;
        } catch (error) {
            this.logger.error('Error creating OTP code:', error);
            throw error;
        }
    }

    async update(id: string, data: UpdateOtpCodeData): Promise<OtpCode | null> {
        try {
            const { data: otpCode, error } = await this.databaseService.client
                .from('otp_codes')
                .update(data)
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to update OTP code ${id}:`, error);
                throw error;
            }

            if (otpCode) {
                this.logger.log(`✅ OTP code updated successfully: ${id}`);
            }

            return otpCode;
        } catch (error) {
            this.logger.error(`Error updating OTP code ${id}:`, error);
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const { error } = await this.databaseService.client
                .from('otp_codes')
                .delete()
                .eq('id', id);

            if (error) {
                this.logger.error(`Failed to delete OTP code ${id}:`, error);
                throw error;
            }

            this.logger.log(`✅ OTP code deleted successfully: ${id}`);
            return true;
        } catch (error) {
            this.logger.error(`Error deleting OTP code ${id}:`, error);
            throw error;
        }
    }

    /**
     * Find active OTP by phone number and purpose
     */
    async findActiveByPhoneAndPurpose(
        phoneE164: string,
        purpose: string = 'registration'
    ): Promise<OtpCode | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('otp_codes')
                .select('*')
                .eq('phone_e164', phoneE164)
                .eq('purpose', purpose)
                .eq('is_used', false)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find active OTP for ${phoneE164}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            this.logger.error(`Error finding active OTP for ${phoneE164}:`, error);
            throw error;
        }
    }

    /**
     * Mark OTP as used
     */
    async markAsUsed(id: string): Promise<OtpCode | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('otp_codes')
                .update({
                    is_used: true,
                    used_at: new Date().toISOString(),
                })
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to mark OTP as used ${id}:`, error);
                throw error;
            }

            if (data) {
                this.logger.log(`✅ OTP marked as used: ${id}`);
            }

            return data;
        } catch (error) {
            this.logger.error(`Error marking OTP as used ${id}:`, error);
            throw error;
        }
    }

    /**
     * Increment attempt count
     */
    async incrementAttempts(id: string): Promise<OtpCode | null> {
        try {
            // First get current attempts count
            const current = await this.findById(id);
            if (!current) {
                return null;
            }

            const newAttempts = current.attempts + 1;

            const { data, error } = await this.databaseService.client
                .from('otp_codes')
                .update({
                    attempts: newAttempts,
                })
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to increment OTP attempts ${id}:`, error);
                throw error;
            }

            if (data) {
                this.logger.log(`✅ OTP attempts incremented: ${id} (${newAttempts}/${current.max_attempts})`);
            }

            return data;
        } catch (error) {
            this.logger.error(`Error incrementing OTP attempts ${id}:`, error);
            throw error;
        }
    }

    /**
     * Clean up expired OTP codes
     */
    async cleanupExpired(): Promise<number> {
        try {
            const { data, error } = await this.databaseService.client
                .from('otp_codes')
                .delete()
                .lt('expires_at', new Date().toISOString())
                .select('id');

            if (error) {
                this.logger.error('Failed to cleanup expired OTP codes:', error);
                throw error;
            }

            const deletedCount = data?.length || 0;
            if (deletedCount > 0) {
                this.logger.log(`✅ Cleaned up ${deletedCount} expired OTP codes`);
            }

            return deletedCount;
        } catch (error) {
            this.logger.error('Error cleaning up expired OTP codes:', error);
            throw error;
        }
    }

    /**
     * Delete OTP after successful verification (Security best practice)
     */
    async deleteAfterVerification(id: string): Promise<boolean> {
        try {
            const { error } = await this.databaseService.client
                .from('otp_codes')
                .delete()
                .eq('id', id);

            if (error) {
                this.logger.error(`Failed to delete verified OTP ${id}:`, error);
                throw error;
            }

            this.logger.log(`🗑️ OTP deleted after successful verification: ${id}`);
            return true;
        } catch (error) {
            this.logger.error(`Error deleting verified OTP ${id}:`, error);
            throw error;
        }
    }

    /**
     * Delete all OTPs for a phone number (useful for cleanup)
     */
    async deleteAllForPhone(phoneE164: string): Promise<number> {
        try {
            const { data, error } = await this.databaseService.client
                .from('otp_codes')
                .delete()
                .eq('phone_e164', phoneE164)
                .select('id');

            if (error) {
                this.logger.error(`Failed to delete OTPs for ${phoneE164}:`, error);
                throw error;
            }

            const deletedCount = data?.length || 0;
            if (deletedCount > 0) {
                this.logger.log(`🗑️ Deleted ${deletedCount} OTP(s) for ${phoneE164}`);
            }

            return deletedCount;
        } catch (error) {
            this.logger.error(`Error deleting OTPs for ${phoneE164}:`, error);
            throw error;
        }
    }

    /**
     * Delete all OTPs for a phone number and specific purpose (before creating new OTP)
     */
    async deleteAllForPhoneAndPurpose(phoneE164: string, purpose: string): Promise<number> {
        try {
            const { data, error } = await this.databaseService.client
                .from('otp_codes')
                .delete()
                .eq('phone_e164', phoneE164)
                .eq('purpose', purpose)
                .select('id');

            if (error) {
                this.logger.error(`Failed to delete OTPs for ${phoneE164} with purpose ${purpose}:`, error);
                throw error;
            }

            const deletedCount = data?.length || 0;
            if (deletedCount > 0) {
                this.logger.log(`🗑️ Deleted ${deletedCount} OTP(s) for ${phoneE164} with purpose ${purpose}`);
            }

            return deletedCount;
        } catch (error) {
            this.logger.error(`Error deleting OTPs for ${phoneE164} with purpose ${purpose}:`, error);
            throw error;
        }
    }

    /**
     * Get OTP statistics
     */
    async getOtpStats(): Promise<{
        total: number;
        active: number;
        expired: number;
        used: number;
        byPurpose: Record<string, number>;
    }> {
        try {
            const now = new Date().toISOString();

            const [totalResult, activeResult, expiredResult, usedResult] = await Promise.all([
                this.databaseService.client.from('otp_codes').select('id', { count: 'exact' }),
                this.databaseService.client.from('otp_codes').select('id', { count: 'exact' })
                    .eq('is_used', false).gt('expires_at', now),
                this.databaseService.client.from('otp_codes').select('id', { count: 'exact' })
                    .eq('is_used', false).lt('expires_at', now),
                this.databaseService.client.from('otp_codes').select('id', { count: 'exact' })
                    .eq('is_used', true),
            ]);

            // Get counts by purpose
            const allOtps = await this.findMany();
            const byPurpose: Record<string, number> = {};
            allOtps.forEach(otp => {
                byPurpose[otp.purpose] = (byPurpose[otp.purpose] || 0) + 1;
            });

            return {
                total: totalResult.count || 0,
                active: activeResult.count || 0,
                expired: expiredResult.count || 0,
                used: usedResult.count || 0,
                byPurpose,
            };
        } catch (error) {
            this.logger.error('Error getting OTP stats:', error);
            throw error;
        }
    }
}
