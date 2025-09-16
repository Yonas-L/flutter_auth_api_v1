import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';

@Injectable()
export class UserStatusSyncService {
    private readonly logger = new Logger(UserStatusSyncService.name);

    constructor(private readonly postgresService: PostgresService) {}

    /**
     * Sync user status across all related tables
     */
    async syncUserStatus(userId: string, newStatus: string): Promise<void> {
        try {
            this.logger.log(`🔄 Syncing user status for ${userId} to ${newStatus}`);

            // Map user status to verification status
            const verificationStatus = this.mapUserStatusToVerificationStatus(newStatus);

            // Update driver profile verification status
            await this.updateDriverProfileStatus(userId, verificationStatus);

            // Update vehicle verification status
            await this.updateVehicleStatus(userId, verificationStatus);

            // Update document verification status
            await this.updateDocumentStatus(userId, verificationStatus);

            this.logger.log(`✅ Successfully synced user status for ${userId}`);
        } catch (error) {
            this.logger.error(`❌ Error syncing user status for ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Map user status to verification status
     */
    private mapUserStatusToVerificationStatus(userStatus: string): string {
        switch (userStatus) {
            case 'verified':
            case 'active':
                return 'verified';
            case 'pending_verification':
                return 'pending_review';
            case 'suspended':
                return 'rejected';
            case 'deleted':
                return 'rejected';
            default:
                return 'unverified';
        }
    }

    /**
     * Update driver profile verification status
     */
    private async updateDriverProfileStatus(userId: string, verificationStatus: string): Promise<void> {
        try {
            const query = `
                UPDATE driver_profiles 
                SET verification_status = $1, updated_at = NOW()
                WHERE user_id = $2
            `;
            const result = await this.postgresService.query(query, [verificationStatus, userId]);
            
            if (result.rowCount > 0) {
                this.logger.log(`✅ Updated driver profile verification status for user ${userId}`);
            }
        } catch (error) {
            this.logger.error(`❌ Error updating driver profile status for ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Update vehicle verification status
     */
    private async updateVehicleStatus(userId: string, verificationStatus: string): Promise<void> {
        try {
            const query = `
                UPDATE vehicles 
                SET verification_status = $1, updated_at = NOW()
                WHERE driver_id IN (
                    SELECT id FROM driver_profiles WHERE user_id = $2
                )
            `;
            const result = await this.postgresService.query(query, [verificationStatus, userId]);
            
            if (result.rowCount > 0) {
                this.logger.log(`✅ Updated vehicle verification status for user ${userId}`);
            }
        } catch (error) {
            this.logger.error(`❌ Error updating vehicle status for ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Update document verification status
     */
    private async updateDocumentStatus(userId: string, verificationStatus: string): Promise<void> {
        try {
            const query = `
                UPDATE documents 
                SET verification_status = $1, updated_at = NOW()
                WHERE user_id = $2
            `;
            const result = await this.postgresService.query(query, [verificationStatus, userId]);
            
            if (result.rowCount > 0) {
                this.logger.log(`✅ Updated document verification status for user ${userId}`);
            }
        } catch (error) {
            this.logger.error(`❌ Error updating document status for ${userId}:`, error);
            throw error;
        }
    }
}
