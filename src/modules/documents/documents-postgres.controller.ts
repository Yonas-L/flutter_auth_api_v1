import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    Request,
    HttpStatus,
    HttpException,
    Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentVerifyDto, FileUploadDto } from './dto/file-upload.dto';
import {
    DocumentResponseDto,
    DocumentStatsDto,
    UserDocumentsSummaryDto,
    DocumentVerificationDto,
    DocumentUploadResponseDto
} from './dto/document-response.dto';
import { LocalStorageService } from '../storage/local-storage.service';

// Configure multer for memory storage (we'll upload to local storage)
const storage = memoryStorage();

@Controller('api/documents')
export class DocumentsPostgresController {
    private readonly logger = new Logger(DocumentsPostgresController.name);

    constructor(
        private readonly documentsService: DocumentsService,
        private readonly localStorageService: LocalStorageService,
    ) { }

    /**
     * Upload a single document to local storage
     */
    @Post('upload')
    @UseGuards(AuthGuard('jwt-postgres'))
    @UseInterceptors(FileInterceptor('file', { storage }))
    async uploadDocument(
        @Request() req: any,
        @UploadedFile() file: Express.Multer.File,
        @Body() uploadDto: FileUploadDto,
    ): Promise<DocumentUploadResponseDto> {
        try {
            if (!file) {
                throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
            }

            // Validate file upload
            const validation = this.documentsService.validateFileUpload(file, uploadDto.doc_type);
            if (!validation.valid) {
                throw new HttpException(validation.error || 'Invalid file', HttpStatus.BAD_REQUEST);
            }

            // Upload file to local storage
            const uploadResult = await this.localStorageService.uploadFile(
                file,
                uploadDto.user_id,
                'documents'
            );

            if (!uploadResult.success) {
                throw new HttpException(
                    uploadResult.error || 'Failed to upload file',
                    HttpStatus.INTERNAL_SERVER_ERROR
                );
            }

            // Create document record
            const createDocumentDto: CreateDocumentDto = {
                user_id: uploadDto.user_id,
                doc_type: uploadDto.doc_type,
                file_path: uploadResult.filePath,
                file_name: uploadResult.fileName,
                file_size_bytes: uploadResult.fileSize,
                mime_type: uploadResult.mimeType,
                public_url: uploadResult.publicUrl,
            };

            const document = await this.documentsService.create(createDocumentDto);

            this.logger.log(`✅ Document uploaded successfully: ${document.id} for user ${uploadDto.user_id}`);

            return new DocumentUploadResponseDto({
                id: document.id,
                user_id: document.user_id,
                doc_type: document.doc_type,
                file_name: document.file_name,
                file_size_bytes: document.file_size_bytes,
                mime_type: document.mime_type,
                public_url: document.public_url,
                verification_status: document.verification_status,
                uploaded_at: document.uploaded_at,
                message: 'Document uploaded successfully',
            });
        } catch (error) {
            this.logger.error('Document upload failed:', error);
            throw error;
        }
    }

    /**
     * Upload multiple documents
     */
    @Post('upload/bulk')
    @UseGuards(AuthGuard('jwt-postgres'))
    @UseInterceptors(FileInterceptor('files', { storage }))
    async uploadMultipleDocuments(
        @Request() req: any,
        @UploadedFile() files: Express.Multer.File[],
        @Body() uploadDto: { user_id: string; doc_types: string[] },
    ): Promise<DocumentUploadResponseDto[]> {
        try {
            if (!files || files.length === 0) {
                throw new HttpException('No files uploaded', HttpStatus.BAD_REQUEST);
            }

            if (files.length !== uploadDto.doc_types.length) {
                throw new HttpException('Number of files must match number of document types', HttpStatus.BAD_REQUEST);
            }

            const uploadResults: DocumentUploadResponseDto[] = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const docType = uploadDto.doc_types[i];

                // Validate file upload
                const validation = this.documentsService.validateFileUpload(file, docType);
                if (!validation.valid) {
                    this.logger.warn(`Skipping invalid file ${file.originalname}: ${validation.error}`);
                    continue;
                }

                // Upload file to local storage
                const uploadResult = await this.localStorageService.uploadFile(
                    file,
                    uploadDto.user_id,
                    'documents'
                );

                if (!uploadResult.success) {
                    this.logger.warn(`Failed to upload file ${file.originalname}: ${uploadResult.error}`);
                    continue;
                }

                // Create document record
                const createDocumentDto: CreateDocumentDto = {
                    user_id: uploadDto.user_id,
                    doc_type: docType,
                    file_path: uploadResult.filePath,
                    file_name: uploadResult.fileName,
                    file_size_bytes: uploadResult.fileSize,
                    mime_type: uploadResult.mimeType,
                    public_url: uploadResult.publicUrl,
                };

                const document = await this.documentsService.create(createDocumentDto);
                uploadResults.push(new DocumentUploadResponseDto({
                    id: document.id,
                    user_id: document.user_id,
                    doc_type: document.doc_type,
                    file_name: document.file_name,
                    file_size_bytes: document.file_size_bytes,
                    mime_type: document.mime_type,
                    public_url: document.public_url,
                    verification_status: document.verification_status,
                    uploaded_at: document.uploaded_at,
                    message: 'Document uploaded successfully',
                }));
            }

            this.logger.log(`✅ Bulk upload completed: ${uploadResults.length} documents uploaded`);
            return uploadResults;
        } catch (error) {
            this.logger.error('Bulk document upload failed:', error);
            throw error;
        }
    }

    /**
     * Get user's documents
     */
    @Get('my-documents/list')
    @UseGuards(AuthGuard('jwt-postgres'))
    async getMyDocuments(@Request() req: any): Promise<DocumentResponseDto[]> {
        try {
            const userId = req.user.id;
            return await this.documentsService.findByUserId(userId);
        } catch (error) {
            this.logger.error('Error getting user documents:', error);
            throw error;
        }
    }

    /**
     * Get user's documents summary
     */
    @Get('my-documents/summary')
    @UseGuards(AuthGuard('jwt-postgres'))
    async getMyDocumentsSummary(@Request() req: any): Promise<UserDocumentsSummaryDto> {
        try {
            const userId = req.user.id;
            return await this.documentsService.getUserDocumentsSummary(userId);
        } catch (error) {
            this.logger.error('Error getting user documents summary:', error);
            throw error;
        }
    }

    /**
     * Get document by ID
     */
    @Get(':id')
    @UseGuards(AuthGuard('jwt-postgres'))
    async getDocument(@Param('id') id: string): Promise<DocumentResponseDto> {
        try {
            return await this.documentsService.findById(id);
        } catch (error) {
            this.logger.error(`Error getting document ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get documents by type
     */
    @Get('type/:docType')
    @UseGuards(AuthGuard('jwt-postgres'))
    async getDocumentsByType(
        @Param('docType') docType: string,
        @Request() req: any,
    ): Promise<DocumentResponseDto[]> {
        try {
            const userId = req.user.id;
            return await this.documentsService.findByUserIdAndType(userId, docType);
        } catch (error) {
            this.logger.error(`Error getting documents by type ${docType}:`, error);
            throw error;
        }
    }

    /**
     * Update document
     */
    @Put(':id')
    @UseGuards(AuthGuard('jwt-postgres'))
    async updateDocument(
        @Param('id') id: string,
        @Body() updateDocumentDto: UpdateDocumentDto,
    ): Promise<DocumentResponseDto> {
        try {
            return await this.documentsService.update(id, updateDocumentDto);
        } catch (error) {
            this.logger.error(`Error updating document ${id}:`, error);
            throw error;
        }
    }

    /**
     * Delete document
     */
    @Delete(':id')
    @UseGuards(AuthGuard('jwt-postgres'))
    async deleteDocument(@Param('id') id: string): Promise<{ message: string }> {
        try {
            // Get document info before deletion for file cleanup
            const document = await this.documentsService.findById(id);

            // Delete from database
            const result = await this.documentsService.delete(id);

            if (result) {
                // Delete physical file from local storage
                const deleteResult = await this.localStorageService.deleteFile(document.file_path);
                if (!deleteResult.success) {
                    this.logger.warn(`Failed to delete physical file: ${deleteResult.error}`);
                }

                this.logger.log(`✅ Document deleted successfully: ${id}`);
                return { message: 'Document deleted successfully' };
            }

            throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
        } catch (error) {
            this.logger.error(`Error deleting document ${id}:`, error);
            throw error;
        }
    }

    /**
     * Verify or reject document
     */
    @Put(':id/verify')
    @UseGuards(AuthGuard('jwt-postgres'))
    async verifyDocument(
        @Param('id') id: string,
        @Body() verifyDto: DocumentVerifyDto,
    ): Promise<DocumentResponseDto> {
        try {
            return await this.documentsService.verifyDocument(id, verifyDto);
        } catch (error) {
            this.logger.error(`Error verifying document ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get document statistics
     */
    @Get('stats/overview')
    @UseGuards(AuthGuard('jwt-postgres'))
    async getDocumentStats(@Query('userId') userId?: string): Promise<DocumentStatsDto> {
        try {
            return await this.documentsService.getDocumentStats(userId);
        } catch (error) {
            this.logger.error('Error getting document stats:', error);
            throw error;
        }
    }

    /**
     * Get documents by user ID (admin only)
     */
    @Get('user/:userId')
    @UseGuards(AuthGuard('jwt-postgres'))
    async getDocumentsByUser(@Param('userId') userId: string): Promise<DocumentResponseDto[]> {
        try {
            return await this.documentsService.findByUserId(userId);
        } catch (error) {
            this.logger.error(`Error getting documents for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Get documents pending review
     */
    @Get('pending-review')
    @UseGuards(AuthGuard('jwt-postgres'))
    async getPendingReview(): Promise<DocumentVerificationDto[]> {
        try {
            return await this.documentsService.getPendingReview();
        } catch (error) {
            this.logger.error('Error getting pending review documents:', error);
            throw error;
        }
    }

    /**
     * Search documents
     */
    @Get('search')
    @UseGuards(AuthGuard('jwt-postgres'))
    async searchDocuments(
        @Query('q') query: string,
        @Request() req: any,
    ): Promise<DocumentResponseDto[]> {
        try {
            const userId = req.user.id;
            return await this.documentsService.searchDocuments(query, userId);
        } catch (error) {
            this.logger.error('Error searching documents:', error);
            throw error;
        }
    }

    /**
     * Get documents by verification status
     */
    @Get('status/:status')
    @UseGuards(AuthGuard('jwt-postgres'))
    async getDocumentsByStatus(
        @Param('status') status: 'pending_review' | 'verified' | 'rejected',
    ): Promise<DocumentResponseDto[]> {
        try {
            return await this.documentsService.getDocumentsByStatus(status);
        } catch (error) {
            this.logger.error(`Error getting documents with status ${status}:`, error);
            throw error;
        }
    }
}
