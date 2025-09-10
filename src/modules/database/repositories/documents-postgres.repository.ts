import { Injectable, Logger } from '@nestjs/common';
import { BasePostgresRepository } from './base-postgres.repository';
import { Document, CreateDocumentData, UpdateDocumentData } from '../entities/document.entity';

@Injectable()
export class DocumentsPostgresRepository extends BasePostgresRepository<Document, CreateDocumentData, UpdateDocumentData> {
    private readonly logger = new Logger(DocumentsPostgresRepository.name);

    constructor() {
        super('documents');
    }

    async findByUserId(userId: string): Promise<Document[]> {
        try {
            const query = `
                SELECT * FROM documents 
                WHERE user_id = $1 
                ORDER BY uploaded_at DESC
            `;
            const result = await this.query(query, [userId]);
            return result.rows;
        } catch (error) {
            this.logger.error(`Error finding documents for user ${userId}:`, error);
            throw error;
        }
    }

    async findByUserIdAndType(userId: string, docType: string): Promise<Document[]> {
        try {
            const query = `
                SELECT * FROM documents 
                WHERE user_id = $1 AND doc_type = $2 
                ORDER BY uploaded_at DESC
            `;
            const result = await this.query(query, [userId, docType]);
            return result.rows;
        } catch (error) {
            this.logger.error(`Error finding ${docType} documents for user ${userId}:`, error);
            throw error;
        }
    }

    async findByVerificationStatus(status: 'pending_review' | 'verified' | 'rejected'): Promise<Document[]> {
        try {
            const query = `
                SELECT * FROM documents 
                WHERE verification_status = $1 
                ORDER BY uploaded_at DESC
            `;
            const result = await this.query(query, [status]);
            return result.rows;
        } catch (error) {
            this.logger.error(`Error finding documents with status ${status}:`, error);
            throw error;
        }
    }

    async findPendingReview(): Promise<Document[]> {
        return this.findByVerificationStatus('pending_review');
    }

    async findVerified(): Promise<Document[]> {
        return this.findByVerificationStatus('verified');
    }

    async findRejected(): Promise<Document[]> {
        return this.findByVerificationStatus('rejected');
    }

    async countDocumentsByStatus(userId?: string): Promise<{
        total: number;
        pending: number;
        verified: number;
        rejected: number;
    }> {
        try {
            let query = `
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN verification_status = 'pending_review' THEN 1 END) as pending,
                    COUNT(CASE WHEN verification_status = 'verified' THEN 1 END) as verified,
                    COUNT(CASE WHEN verification_status = 'rejected' THEN 1 END) as rejected
                FROM documents
            `;
            const params: any[] = [];

            if (userId) {
                query += ' WHERE user_id = $1';
                params.push(userId);
            }

            const result = await this.query(query, params);
            const row = result.rows[0];

            return {
                total: parseInt(row.total) || 0,
                pending: parseInt(row.pending) || 0,
                verified: parseInt(row.verified) || 0,
                rejected: parseInt(row.rejected) || 0,
            };
        } catch (error) {
            this.logger.error('Error counting documents by status:', error);
            throw error;
        }
    }

    async findDocumentsWithUserInfo(): Promise<(Document & { user_info?: any })[]> {
        try {
            const query = `
                SELECT 
                    d.*,
                    json_build_object(
                        'id', u.id,
                        'display_name', u.full_name,
                        'phone_e164', u.phone_number
                    ) as user_info
                FROM documents d
                LEFT JOIN users u ON d.user_id = u.id
                ORDER BY d.uploaded_at DESC
            `;
            const result = await this.query(query);
            return result.rows;
        } catch (error) {
            this.logger.error('Error finding documents with user info:', error);
            throw error;
        }
    }

    async getStorageStats(userId?: string): Promise<{
        totalFiles: number;
        totalSizeBytes: number;
        averageFileSize: number;
        filesByType: Record<string, number>;
        sizeByType: Record<string, number>;
    }> {
        try {
            let query = `
                SELECT 
                    COUNT(*) as total_files,
                    COALESCE(SUM(file_size_bytes), 0) as total_size_bytes,
                    COALESCE(AVG(file_size_bytes), 0) as average_file_size,
                    doc_type,
                    COALESCE(SUM(file_size_bytes), 0) as size_by_type
                FROM documents
            `;
            const params: any[] = [];

            if (userId) {
                query += ' WHERE user_id = $1';
                params.push(userId);
            }

            query += ' GROUP BY doc_type';

            const result = await this.query(query, params);
            const rows = result.rows;

            const totalFiles = rows.reduce((sum, row) => sum + parseInt(row.total_files), 0);
            const totalSizeBytes = rows.reduce((sum, row) => sum + parseInt(row.total_size_bytes), 0);
            const averageFileSize = totalFiles > 0 ? Math.round(totalSizeBytes / totalFiles) : 0;

            const filesByType: Record<string, number> = {};
            const sizeByType: Record<string, number> = {};

            rows.forEach(row => {
                filesByType[row.doc_type] = parseInt(row.total_files);
                sizeByType[row.doc_type] = parseInt(row.size_by_type);
            });

            return {
                totalFiles,
                totalSizeBytes,
                averageFileSize,
                filesByType,
                sizeByType,
            };
        } catch (error) {
            this.logger.error('Error getting storage stats:', error);
            throw error;
        }
    }

    async bulkCreate(documents: CreateDocumentData[]): Promise<Document[]> {
        try {
            if (documents.length === 0) {
                return [];
            }

            const values = documents.map((doc, index) => {
                const baseIndex = index * 7;
                return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7})`;
            }).join(', ');

            const query = `
                INSERT INTO documents (
                    user_id, doc_type, file_path, file_name, file_size_bytes, 
                    mime_type, public_url, verification_status, notes, uploaded_at, updated_at
                ) VALUES ${values}
                RETURNING *
            `;

            const params: any[] = [];
            documents.forEach(doc => {
                params.push(
                    doc.user_id,
                    doc.doc_type,
                    doc.file_path,
                    doc.file_name,
                    doc.file_size_bytes,
                    doc.mime_type || null,
                    doc.public_url || null,
                    doc.verification_status || 'pending_review',
                    doc.notes || null,
                    new Date().toISOString(),
                    new Date().toISOString()
                );
            });

            const result = await this.query(query, params);
            this.logger.log(`✅ Bulk created ${result.rows.length} documents successfully`);
            return result.rows;
        } catch (error) {
            this.logger.error('Error bulk creating documents:', error);
            throw error;
        }
    }
}
