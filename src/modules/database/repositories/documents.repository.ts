import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { BaseRepository } from '../interfaces/base-repository.interface';
import { Document, CreateDocumentData, UpdateDocumentData } from '../entities/document.entity';

@Injectable()
export class DocumentsRepository implements BaseRepository<Document, CreateDocumentData, UpdateDocumentData> {
    private readonly logger = new Logger(DocumentsRepository.name);

    constructor(private readonly databaseService: DatabaseService) { }

    async findById(id: string): Promise<Document | null> {
        try {
            const { data, error } = await this.databaseService.client
                .from('documents')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to find document by ID ${id}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            this.logger.error(`Error finding document by ID ${id}:`, error);
            throw error;
        }
    }

    async findMany(filters?: Partial<Document>): Promise<Document[]> {
        try {
            let query = this.databaseService.client.from('documents').select('*');

            if (filters) {
                Object.entries(filters).forEach(([key, value]) => {
                    if (value !== undefined) {
                        query = query.eq(key, value);
                    }
                });
            }

            const { data, error } = await query;

            if (error) {
                this.logger.error('Failed to find documents:', error);
                throw error;
            }

            return data || [];
        } catch (error) {
            this.logger.error('Error finding documents:', error);
            throw error;
        }
    }

    async create(data: CreateDocumentData): Promise<Document> {
        try {
            const { data: document, error } = await this.databaseService.client
                .from('documents')
                .insert([{
                    ...data,
                    verification_status: data.verification_status || 'pending_review',
                }])
                .select()
                .single();

            if (error) {
                this.logger.error('Failed to create document:', error);
                throw error;
            }

            this.logger.log(`✅ Document created successfully: ${document.id}`);
            return document;
        } catch (error) {
            this.logger.error('Error creating document:', error);
            throw error;
        }
    }

    async update(id: string, data: UpdateDocumentData): Promise<Document | null> {
        try {
            const updateData = {
                ...data,
                updated_at: new Date().toISOString(),
            };

            const { data: document, error } = await this.databaseService.client
                .from('documents')
                .update(updateData)
                .eq('id', id)
                .select()
                .maybeSingle();

            if (error) {
                this.logger.error(`Failed to update document ${id}:`, error);
                throw error;
            }

            if (document) {
                this.logger.log(`✅ Document updated successfully: ${id}`);
            }

            return document;
        } catch (error) {
            this.logger.error(`Error updating document ${id}:`, error);
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            // Hard delete for documents (they're files, so we want to remove them completely)
            const { error } = await this.databaseService.client
                .from('documents')
                .delete()
                .eq('id', id);

            if (error) {
                this.logger.error(`Failed to delete document ${id}:`, error);
                throw error;
            }

            this.logger.log(`✅ Document deleted successfully: ${id}`);
            return true;
        } catch (error) {
            this.logger.error(`Error deleting document ${id}:`, error);
            throw error;
        }
    }

    async findByUserId(userId: string): Promise<Document[]> {
        return this.findMany({ user_id: userId });
    }

    async findByUserIdAndType(userId: string, docType: string): Promise<Document[]> {
        return this.findMany({ user_id: userId, doc_type: docType });
    }

    async findByVerificationStatus(status: 'pending_review' | 'verified' | 'rejected'): Promise<Document[]> {
        return this.findMany({ verification_status: status });
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
            const baseFilter = userId ? { user_id: userId } : {};

            const [totalResult, pendingResult, verifiedResult, rejectedResult] = await Promise.all([
                this.databaseService.client.from('documents').select('id', { count: 'exact' }).match(baseFilter),
                this.databaseService.client.from('documents').select('id', { count: 'exact' }).match({ ...baseFilter, verification_status: 'pending_review' }),
                this.databaseService.client.from('documents').select('id', { count: 'exact' }).match({ ...baseFilter, verification_status: 'verified' }),
                this.databaseService.client.from('documents').select('id', { count: 'exact' }).match({ ...baseFilter, verification_status: 'rejected' }),
            ]);

            return {
                total: totalResult.count || 0,
                pending: pendingResult.count || 0,
                verified: verifiedResult.count || 0,
                rejected: rejectedResult.count || 0,
            };
        } catch (error) {
            this.logger.error('Error counting documents by status:', error);
            throw error;
        }
    }

    async findDocumentsWithUserInfo(): Promise<(Document & { user_info?: any })[]> {
        try {
            const { data, error } = await this.databaseService.client
                .from('documents')
                .select(`
                    *,
                    users!user_id (
                        id,
                        display_name,
                        phone_e164
                    )
                `)
                .order('uploaded_at', { ascending: false });

            if (error) {
                this.logger.error('Failed to find documents with user info:', error);
                throw error;
            }

            return data || [];
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
            const baseFilter = userId ? { user_id: userId } : {};
            const documents = await this.findMany(baseFilter);

            const totalFiles = documents.length;
            const totalSizeBytes = documents.reduce((sum, doc) => sum + (doc.file_size_bytes || 0), 0);
            const averageFileSize = totalFiles > 0 ? Math.round(totalSizeBytes / totalFiles) : 0;

            const filesByType: Record<string, number> = {};
            const sizeByType: Record<string, number> = {};

            documents.forEach(doc => {
                const type = doc.doc_type;
                filesByType[type] = (filesByType[type] || 0) + 1;
                sizeByType[type] = (sizeByType[type] || 0) + (doc.file_size_bytes || 0);
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
            const documentsWithDefaults = documents.map(doc => ({
                ...doc,
                verification_status: doc.verification_status || 'pending_review',
            }));

            const { data, error } = await this.databaseService.client
                .from('documents')
                .insert(documentsWithDefaults)
                .select();

            if (error) {
                this.logger.error('Failed to bulk create documents:', error);
                throw error;
            }

            this.logger.log(`✅ Bulk created ${data?.length || 0} documents successfully`);
            return data || [];
        } catch (error) {
            this.logger.error('Error bulk creating documents:', error);
            throw error;
        }
    }
}
