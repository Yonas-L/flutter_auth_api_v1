import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DocumentsPostgresRepository } from '../database/repositories/documents-postgres.repository';
import { UsersPostgresRepository } from '../database/repositories/users-postgres.repository';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentVerifyDto } from './dto/file-upload.dto';
import {
    DocumentResponseDto,
    DocumentStatsDto,
    UserDocumentsSummaryDto,
    DocumentVerificationDto,
    DocumentUploadResponseDto
} from './dto/document-response.dto';
import { Document } from '../database/entities/document.entity';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class DocumentsService {
    private readonly logger = new Logger(DocumentsService.name);

    // Define required documents for drivers
    private readonly REQUIRED_DRIVER_DOCUMENTS = [
        'driver_license',
        'profile_picture',
    ];

    // Define allowed file types
    private readonly ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'application/pdf',
    ];

    // Define max file size (10MB)
    private readonly MAX_FILE_SIZE = 10 * 1024 * 1024;

    constructor(
        private readonly documentsRepository: DocumentsPostgresRepository,
        private readonly usersRepository: UsersPostgresRepository,
    ) { }

    /**
     * Create a new document record
     */
    async create(createDocumentDto: CreateDocumentDto): Promise<DocumentResponseDto> {
        try {
            // Verify user exists
            const user = await this.usersRepository.findById(createDocumentDto.user_id);
            if (!user) {
                throw new NotFoundException('User not found');
            }

            // Validate file size
            if (createDocumentDto.file_size_bytes > this.MAX_FILE_SIZE) {
                throw new BadRequestException(`File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
            }

            // Validate mime type if provided
            if (createDocumentDto.mime_type && !this.ALLOWED_MIME_TYPES.includes(createDocumentDto.mime_type)) {
                throw new BadRequestException(`File type ${createDocumentDto.mime_type} is not allowed`);
            }

            // Create the document
            const document = await this.documentsRepository.create(createDocumentDto);

            this.logger.log(`✅ Document created successfully: ${document.id} for user ${createDocumentDto.user_id}`);
            return new DocumentResponseDto(document);
        } catch (error) {
            this.logger.error('Error creating document:', error);
            throw error;
        }
    }

    /**
     * Create or replace document - ensures only one document per user per type
     */
    async createOrReplaceDocument(createDocumentDto: CreateDocumentDto): Promise<DocumentResponseDto> {
        try {
            // Verify user exists
            const user = await this.usersRepository.findById(createDocumentDto.user_id);
            if (!user) {
                throw new NotFoundException('User not found');
            }

            // Validate file size
            if (createDocumentDto.file_size_bytes > this.MAX_FILE_SIZE) {
                throw new BadRequestException(`File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
            }

            // Validate mime type if provided
            if (createDocumentDto.mime_type && !this.ALLOWED_MIME_TYPES.includes(createDocumentDto.mime_type)) {
                throw new BadRequestException(`File type ${createDocumentDto.mime_type} is not allowed`);
            }

            // Check if user already has a document of this type
            const existingDocuments = await this.documentsRepository.findByUserIdAndType(
                createDocumentDto.user_id,
                createDocumentDto.doc_type
            );

            let document: any;

            if (existingDocuments.length > 0) {
                // Replace existing document
                const existingDocument = existingDocuments[0];
                this.logger.log(`🔄 Replacing existing ${createDocumentDto.doc_type}: ${existingDocument.id} for user ${createDocumentDto.user_id}`);

                // Update the existing document with new data
                const updateData = {
                    file_path: createDocumentDto.file_path,
                    file_name: createDocumentDto.file_name,
                    file_size_bytes: createDocumentDto.file_size_bytes,
                    mime_type: createDocumentDto.mime_type,
                    public_url: createDocumentDto.public_url,
                    notes: createDocumentDto.notes,
                    verification_status: 'pending_review' as const,
                    uploaded_at: new Date().toISOString(),
                };

                document = await this.documentsRepository.update(existingDocument.id, updateData);
                this.logger.log(`✅ ${createDocumentDto.doc_type} replaced successfully: ${document.id} for user ${createDocumentDto.user_id}`);
            } else {
                // Create new document
                this.logger.log(`📤 Creating new ${createDocumentDto.doc_type} for user ${createDocumentDto.user_id}`);
                document = await this.documentsRepository.create(createDocumentDto);
                this.logger.log(`✅ ${createDocumentDto.doc_type} created successfully: ${document.id} for user ${createDocumentDto.user_id}`);
            }

            return {
                id: document.id,
                user_id: document.user_id,
                doc_type: document.doc_type,
                file_name: document.file_name,
                file_path: document.file_path,
                file_size_bytes: document.file_size_bytes,
                mime_type: document.mime_type,
                public_url: document.public_url,
                verification_status: document.verification_status,
                notes: document.notes,
                uploaded_at: document.uploaded_at,
                updated_at: document.updated_at,
            };
        } catch (error) {
            this.logger.error(`❌ Error creating/replacing ${createDocumentDto.doc_type} for user ${createDocumentDto.user_id}:`, error);
            throw error;
        }
    }

    /**
     * Create or replace avatar - ensures only one avatar per user
     */
    async createOrReplaceAvatar(createDocumentDto: CreateDocumentDto): Promise<DocumentResponseDto> {
        try {
            // Verify user exists
            const user = await this.usersRepository.findById(createDocumentDto.user_id);
            if (!user) {
                throw new NotFoundException('User not found');
            }

            // Validate file size
            if (createDocumentDto.file_size_bytes > this.MAX_FILE_SIZE) {
                throw new BadRequestException(`File size exceeds maximum allowed size of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
            }

            // Validate mime type if provided
            if (createDocumentDto.mime_type && !this.ALLOWED_MIME_TYPES.includes(createDocumentDto.mime_type)) {
                throw new BadRequestException(`File type ${createDocumentDto.mime_type} is not allowed`);
            }

            // Check if user already has an avatar
            const existingAvatars = await this.documentsRepository.findByUserIdAndType(
                createDocumentDto.user_id,
                'profile_picture'
            );

            let document: any;

            if (existingAvatars.length > 0) {
                // Replace existing avatar
                const existingAvatar = existingAvatars[0];
                this.logger.log(`🔄 Replacing existing avatar: ${existingAvatar.id} for user ${createDocumentDto.user_id}`);

                // Update the existing document with new data
                const updateData = {
                    file_path: createDocumentDto.file_path,
                    file_name: createDocumentDto.file_name,
                    file_size_bytes: createDocumentDto.file_size_bytes,
                    mime_type: createDocumentDto.mime_type,
                    public_url: createDocumentDto.public_url,
                    notes: createDocumentDto.notes,
                    uploaded_at: new Date().toISOString(),
                };

                document = await this.documentsRepository.update(existingAvatar.id, updateData);
                this.logger.log(`✅ Avatar replaced successfully: ${document.id} for user ${createDocumentDto.user_id}`);
            } else {
                // Create new avatar
                this.logger.log(`📤 Creating new avatar for user ${createDocumentDto.user_id}`);
                document = await this.documentsRepository.create(createDocumentDto);
                this.logger.log(`✅ Avatar created successfully: ${document.id} for user ${createDocumentDto.user_id}`);
            }

            return new DocumentResponseDto(document);
        } catch (error) {
            this.logger.error('Error creating or replacing avatar:', error);
            throw error;
        }
    }

    /**
     * Get document by ID
     */
    async findById(id: string): Promise<DocumentResponseDto> {
        try {
            const document = await this.documentsRepository.findById(id);
            if (!document) {
                throw new NotFoundException('Document not found');
            }
            return new DocumentResponseDto(document);
        } catch (error) {
            this.logger.error(`Error finding document ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get all documents with optional filters
     */
    async findAll(filters?: Partial<Document>): Promise<DocumentResponseDto[]> {
        try {
            const documents = await this.documentsRepository.findMany(filters);
            return documents.map(document => new DocumentResponseDto(document));
        } catch (error) {
            this.logger.error('Error finding documents:', error);
            throw error;
        }
    }

    /**
     * Get documents by user ID
     */
    async findByUserId(userId: string): Promise<DocumentResponseDto[]> {
        try {
            const documents = await this.documentsRepository.findByUserId(userId);
            return documents.map(document => new DocumentResponseDto(document));
        } catch (error) {
            this.logger.error(`Error finding documents for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Get documents by user ID and type
     */
    async findByUserIdAndType(userId: string, docType: string): Promise<DocumentResponseDto[]> {
        try {
            const documents = await this.documentsRepository.findByUserIdAndType(userId, docType);
            return documents.map(document => new DocumentResponseDto(document));
        } catch (error) {
            this.logger.error(`Error finding ${docType} documents for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Update document
     */
    async update(id: string, updateDocumentDto: UpdateDocumentDto): Promise<DocumentResponseDto> {
        try {
            const document = await this.documentsRepository.update(id, updateDocumentDto);
            if (!document) {
                throw new NotFoundException('Document not found');
            }

            this.logger.log(`✅ Document updated successfully: ${id}`);
            return new DocumentResponseDto(document);
        } catch (error) {
            this.logger.error(`Error updating document ${id}:`, error);
            throw error;
        }
    }

    /**
     * Delete document
     */
    async delete(id: string): Promise<boolean> {
        try {
            // Get document info before deletion for file cleanup
            const document = await this.documentsRepository.findById(id);
            if (!document) {
                throw new NotFoundException('Document not found');
            }

            // Delete from database
            const result = await this.documentsRepository.delete(id);

            if (result) {
                // TODO: Delete physical file from storage
                // await this.deletePhysicalFile(document.file_path);
                this.logger.log(`✅ Document deleted successfully: ${id}`);
            }

            return result;
        } catch (error) {
            this.logger.error(`Error deleting document ${id}:`, error);
            throw error;
        }
    }

    /**
     * Verify or reject document
     */
    async verifyDocument(id: string, verifyDto: DocumentVerifyDto): Promise<DocumentResponseDto> {
        try {
            const updateData: UpdateDocumentDto = {
                verification_status: verifyDto.verification_status,
                notes: verifyDto.notes,
                reviewer_user_id: verifyDto.reviewer_user_id,
            };

            if (verifyDto.verification_status === 'verified' || verifyDto.verification_status === 'rejected') {
                updateData.reviewed_at = new Date().toISOString();
            }

            const document = await this.documentsRepository.update(id, updateData);
            if (!document) {
                throw new NotFoundException('Document not found');
            }

            this.logger.log(`✅ Document ${verifyDto.verification_status}: ${id}`);
            return new DocumentResponseDto(document);
        } catch (error) {
            this.logger.error(`Error verifying document ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get documents pending review
     */
    async getPendingReview(): Promise<DocumentVerificationDto[]> {
        try {
            const documents = await this.documentsRepository.findDocumentsWithUserInfo();
            const pendingDocs = documents.filter(doc => doc.verification_status === 'pending_review');

            return pendingDocs.map(doc => new DocumentVerificationDto({
                id: doc.id,
                doc_type: doc.doc_type,
                file_name: doc.file_name,
                verification_status: doc.verification_status,
                notes: doc.notes,
                reviewed_at: doc.reviewed_at,
                reviewer_user_id: doc.reviewer_user_id,
                user_info: doc.user_info ? {
                    id: doc.user_info.id,
                    display_name: doc.user_info.display_name,
                    phone_e164: doc.user_info.phone_e164,
                } : undefined,
            }));
        } catch (error) {
            this.logger.error('Error getting pending review documents:', error);
            throw error;
        }
    }

    /**
     * Get document statistics
     */
    async getDocumentStats(userId?: string): Promise<DocumentStatsDto> {
        try {
            const statusCounts = await this.documentsRepository.countDocumentsByStatus(userId);
            const storageStats = await this.documentsRepository.getStorageStats(userId);

            // Get document counts by user (if not filtered by user)
            const documentsByUser: Record<string, number> = {};
            if (!userId) {
                const allDocuments = await this.documentsRepository.findMany();
                allDocuments.forEach(doc => {
                    documentsByUser[doc.user_id] = (documentsByUser[doc.user_id] || 0) + 1;
                });
            }

            return new DocumentStatsDto({
                totalDocuments: statusCounts.total,
                pendingReview: statusCounts.pending,
                verified: statusCounts.verified,
                rejected: statusCounts.rejected,
                documentsByType: storageStats.filesByType,
                documentsByUser,
                averageFileSize: storageStats.averageFileSize,
                totalStorageUsed: storageStats.totalSizeBytes,
            });
        } catch (error) {
            this.logger.error('Error getting document stats:', error);
            throw error;
        }
    }

    /**
     * Get user documents summary
     */
    async getUserDocumentsSummary(userId: string): Promise<UserDocumentsSummaryDto> {
        try {
            const documents = await this.findByUserId(userId);
            const statusCounts = await this.documentsRepository.countDocumentsByStatus(userId);

            // Check which required documents are missing
            const existingTypes = documents.map(doc => doc.doc_type);
            const missingDocuments = this.REQUIRED_DRIVER_DOCUMENTS.filter(
                type => !existingTypes.includes(type)
            );

            return new UserDocumentsSummaryDto({
                userId,
                totalDocuments: statusCounts.total,
                verifiedDocuments: statusCounts.verified,
                pendingDocuments: statusCounts.pending,
                rejectedDocuments: statusCounts.rejected,
                requiredDocuments: this.REQUIRED_DRIVER_DOCUMENTS,
                missingDocuments,
                documents,
            });
        } catch (error) {
            this.logger.error(`Error getting user documents summary for ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Bulk create documents
     */
    async bulkCreate(documents: CreateDocumentDto[]): Promise<DocumentResponseDto[]> {
        try {
            // Validate all documents first
            for (const doc of documents) {
                if (doc.file_size_bytes > this.MAX_FILE_SIZE) {
                    throw new BadRequestException(`File ${doc.file_name} exceeds maximum size`);
                }
                if (doc.mime_type && !this.ALLOWED_MIME_TYPES.includes(doc.mime_type)) {
                    throw new BadRequestException(`File type ${doc.mime_type} not allowed for ${doc.file_name}`);
                }
            }

            const createdDocuments = await this.documentsRepository.bulkCreate(documents);
            return createdDocuments.map(doc => new DocumentResponseDto(doc));
        } catch (error) {
            this.logger.error('Error bulk creating documents:', error);
            throw error;
        }
    }

    /**
     * Search documents by filename or notes
     */
    async searchDocuments(query: string, userId?: string): Promise<DocumentResponseDto[]> {
        try {
            const baseFilter = userId ? { user_id: userId } : {};
            const allDocuments = await this.documentsRepository.findMany(baseFilter);

            const searchTerm = query.toLowerCase();
            const filteredDocuments = allDocuments.filter(doc =>
                doc.file_name?.toLowerCase().includes(searchTerm) ||
                doc.notes?.toLowerCase().includes(searchTerm) ||
                doc.doc_type?.toLowerCase().includes(searchTerm)
            );

            return filteredDocuments.map(doc => new DocumentResponseDto(doc));
        } catch (error) {
            this.logger.error('Error searching documents:', error);
            throw error;
        }
    }

    /**
     * Get documents by verification status
     */
    async getDocumentsByStatus(status: 'pending_review' | 'verified' | 'rejected'): Promise<DocumentResponseDto[]> {
        try {
            const documents = await this.documentsRepository.findByVerificationStatus(status);
            return documents.map(doc => new DocumentResponseDto(doc));
        } catch (error) {
            this.logger.error(`Error getting documents with status ${status}:`, error);
            throw error;
        }
    }

    /**
     * Check if user has all required documents
     */
    async hasRequiredDocuments(userId: string): Promise<boolean> {
        try {
            const summary = await this.getUserDocumentsSummary(userId);
            return summary.missingDocuments.length === 0;
        } catch (error) {
            this.logger.error(`Error checking required documents for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Get allowed file types
     */
    getAllowedFileTypes(): string[] {
        return [...this.ALLOWED_MIME_TYPES];
    }

    /**
     * Get max file size
     */
    getMaxFileSize(): number {
        return this.MAX_FILE_SIZE;
    }

    /**
     * Get required document types
     */
    getRequiredDocumentTypes(): string[] {
        return [...this.REQUIRED_DRIVER_DOCUMENTS];
    }

    /**
     * Validate file upload
     */
    validateFileUpload(file: any, docType: string): { valid: boolean; error?: string } {
        if (!file) {
            return { valid: false, error: 'No file provided' };
        }

        if (file.size > this.MAX_FILE_SIZE) {
            return { valid: false, error: `File size exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit` };
        }

        if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return { valid: false, error: `File type ${file.mimetype} is not allowed` };
        }

        return { valid: true };
    }
}
