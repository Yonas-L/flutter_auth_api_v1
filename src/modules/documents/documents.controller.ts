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
    UploadedFiles,
    Request,
    HttpStatus,
    HttpException,
    Logger,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
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

// Configure multer for file storage
const storage = diskStorage({
    destination: (req, file, cb) => {
        // Create uploads directory structure
        const uploadPath = join(process.cwd(), 'uploads', 'documents');
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = extname(file.originalname);
        cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
    },
});

@Controller('api/documents')
export class DocumentsController {
    private readonly logger = new Logger(DocumentsController.name);

    constructor(private readonly documentsService: DocumentsService) { }

    /**
     * Upload a single document
     */
    @Post('upload')
    @UseGuards(AuthGuard('jwt'))
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

            // Create document record
            const createDocumentDto: CreateDocumentDto = {
                user_id: uploadDto.user_id,
                doc_type: uploadDto.doc_type,
                file_path: file.path,
                file_name: file.originalname,
                file_size_bytes: file.size,
                mime_type: file.mimetype,
                notes: uploadDto.notes,
            };

            const document = await this.documentsService.create(createDocumentDto);

            return new DocumentUploadResponseDto({
                id: document.id,
                file_name: document.file_name,
                file_path: document.file_path,
                file_size_bytes: document.file_size_bytes,
                mime_type: document.mime_type,
                public_url: document.public_url,
                doc_type: document.doc_type,
                verification_status: document.verification_status,
                uploaded_at: document.uploaded_at,
            });
        } catch (error) {
            this.logger.error('Error uploading document:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to upload document', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Upload multiple documents
     */
    @Post('upload/bulk')
    @UseGuards(AuthGuard('jwt'))
    @UseInterceptors(FilesInterceptor('files', 10, { storage }))
    async uploadMultipleDocuments(
        @Request() req: any,
        @UploadedFiles() files: Array<Express.Multer.File>,
        @Body() uploadDto: any, // Will contain file metadata
    ): Promise<DocumentUploadResponseDto[]> {
        try {
            if (!files || files.length === 0) {
                throw new HttpException('No files uploaded', HttpStatus.BAD_REQUEST);
            }

            const documentPromises = files.map(async (file, index) => {
                // Validate each file
                const docType = uploadDto[`doc_type_${index}`] || 'other';
                const validation = this.documentsService.validateFileUpload(file, docType);
                if (!validation.valid) {
                    throw new HttpException(`File ${file.originalname}: ${validation.error || 'Invalid file'}`, HttpStatus.BAD_REQUEST);
                }

                const createDocumentDto: CreateDocumentDto = {
                    user_id: uploadDto.user_id,
                    doc_type: docType,
                    file_path: file.path,
                    file_name: file.originalname,
                    file_size_bytes: file.size,
                    mime_type: file.mimetype,
                    notes: uploadDto[`notes_${index}`],
                };

                return await this.documentsService.create(createDocumentDto);
            });

            const documents = await Promise.all(documentPromises);

            return documents.map(doc => new DocumentUploadResponseDto({
                id: doc.id,
                file_name: doc.file_name,
                file_path: doc.file_path,
                file_size_bytes: doc.file_size_bytes,
                mime_type: doc.mime_type,
                public_url: doc.public_url,
                doc_type: doc.doc_type,
                verification_status: doc.verification_status,
                uploaded_at: doc.uploaded_at,
            }));
        } catch (error) {
            this.logger.error('Error uploading multiple documents:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to upload documents', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Search documents
     */
    @Get('search')
    async searchDocuments(
        @Query('q') query?: string,
        @Query('user_id') userId?: string,
    ): Promise<DocumentResponseDto[]> {
        try {
            if (!query || query.trim().length < 2) {
                throw new HttpException('Search query must be at least 2 characters', HttpStatus.BAD_REQUEST);
            }

            const documents = await this.documentsService.searchDocuments(query.trim(), userId);
            return documents;
        } catch (error) {
            this.logger.error('Error searching documents:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to search documents', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get document by ID
     */
    @Get(':id')
    async getDocumentById(@Param('id') id: string): Promise<DocumentResponseDto> {
        try {
            const document = await this.documentsService.findById(id);
            return document;
        } catch (error) {
            this.logger.error(`Error getting document ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to get document', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get all documents with optional filters
     */
    @Get()
    async getAllDocuments(
        @Query('user_id') userId?: string,
        @Query('doc_type') docType?: string,
        @Query('verification_status') verificationStatus?: string,
    ): Promise<DocumentResponseDto[]> {
        try {
            const filters: any = {};

            if (userId) filters.user_id = userId;
            if (docType) filters.doc_type = docType;
            if (verificationStatus) filters.verification_status = verificationStatus;

            const documents = await this.documentsService.findAll(filters);
            return documents;
        } catch (error) {
            this.logger.error('Error getting all documents:', error);
            throw new HttpException('Failed to get documents', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get current user's documents
     */
    @Get('my-documents/list')
    @UseGuards(AuthGuard('jwt'))
    async getCurrentUserDocuments(@Request() req: any): Promise<DocumentResponseDto[]> {
        try {
            const userId = req.user.id;
            const documents = await this.documentsService.findByUserId(userId);
            return documents;
        } catch (error) {
            this.logger.error('Error getting current user documents:', error);
            throw new HttpException('Failed to get documents', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get current user's document summary
     */
    @Get('my-documents/summary')
    @UseGuards(AuthGuard('jwt'))
    async getCurrentUserDocumentsSummary(@Request() req: any): Promise<UserDocumentsSummaryDto> {
        try {
            const userId = req.user.id;
            const summary = await this.documentsService.getUserDocumentsSummary(userId);
            return summary;
        } catch (error) {
            this.logger.error('Error getting user documents summary:', error);
            throw new HttpException('Failed to get documents summary', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get documents by user ID
     */
    @Get('user/:userId')
    async getDocumentsByUserId(@Param('userId') userId: string): Promise<DocumentResponseDto[]> {
        try {
            const documents = await this.documentsService.findByUserId(userId);
            return documents;
        } catch (error) {
            this.logger.error(`Error getting documents for user ${userId}:`, error);
            throw new HttpException('Failed to get documents', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get documents by user ID and type
     */
    @Get('user/:userId/type/:docType')
    async getDocumentsByUserIdAndType(
        @Param('userId') userId: string,
        @Param('docType') docType: string,
    ): Promise<DocumentResponseDto[]> {
        try {
            const documents = await this.documentsService.findByUserIdAndType(userId, docType);
            return documents;
        } catch (error) {
            this.logger.error(`Error getting ${docType} documents for user ${userId}:`, error);
            throw new HttpException('Failed to get documents', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Update document
     */
    @Put(':id')
    @UseGuards(AuthGuard('jwt'))
    async updateDocument(
        @Param('id') id: string,
        @Body() updateDocumentDto: UpdateDocumentDto,
    ): Promise<DocumentResponseDto> {
        try {
            const document = await this.documentsService.update(id, updateDocumentDto);
            return document;
        } catch (error) {
            this.logger.error(`Error updating document ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to update document', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Delete document
     */
    @Delete(':id')
    @UseGuards(AuthGuard('jwt'))
    async deleteDocument(@Param('id') id: string): Promise<{ success: boolean }> {
        try {
            const success = await this.documentsService.delete(id);
            return { success };
        } catch (error) {
            this.logger.error(`Error deleting document ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to delete document', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Verify or reject document
     */
    @Put(':id/verify')
    @UseGuards(AuthGuard('jwt'))
    async verifyDocument(
        @Param('id') id: string,
        @Body() verifyDto: DocumentVerifyDto,
    ): Promise<DocumentResponseDto> {
        try {
            const document = await this.documentsService.verifyDocument(id, verifyDto);
            return document;
        } catch (error) {
            this.logger.error(`Error verifying document ${id}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to verify document', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get documents pending review
     */
    @Get('review/pending')
    @UseGuards(AuthGuard('jwt'))
    async getPendingReviewDocuments(): Promise<DocumentVerificationDto[]> {
        try {
            const documents = await this.documentsService.getPendingReview();
            return documents;
        } catch (error) {
            this.logger.error('Error getting pending review documents:', error);
            throw new HttpException('Failed to get pending documents', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get documents by verification status
     */
    @Get('status/:status')
    async getDocumentsByStatus(@Param('status') status: string): Promise<DocumentResponseDto[]> {
        try {
            // Validate status parameter
            const validStatuses = ['pending_review', 'verified', 'rejected'];
            if (!validStatuses.includes(status)) {
                throw new HttpException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, HttpStatus.BAD_REQUEST);
            }

            const documents = await this.documentsService.getDocumentsByStatus(status as 'pending_review' | 'verified' | 'rejected');
            return documents;
        } catch (error) {
            this.logger.error(`Error getting documents with status ${status}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to get documents', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get document statistics
     */
    @Get('stats/summary')
    async getDocumentStats(
        @Query('user_id') userId?: string,
    ): Promise<DocumentStatsDto> {
        try {
            const stats = await this.documentsService.getDocumentStats(userId);
            return stats;
        } catch (error) {
            this.logger.error('Error getting document stats:', error);
            throw new HttpException('Failed to get document stats', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get allowed file types
     */
    @Get('config/file-types')
    async getAllowedFileTypes(): Promise<{ allowedTypes: string[]; maxFileSize: number; requiredDocuments: string[] }> {
        try {
            return {
                allowedTypes: this.documentsService.getAllowedFileTypes(),
                maxFileSize: this.documentsService.getMaxFileSize(),
                requiredDocuments: this.documentsService.getRequiredDocumentTypes(),
            };
        } catch (error) {
            this.logger.error('Error getting file config:', error);
            throw new HttpException('Failed to get file configuration', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Check if user has required documents
     */
    @Get('user/:userId/required-check')
    async checkRequiredDocuments(@Param('userId') userId: string): Promise<{ hasRequired: boolean }> {
        try {
            const hasRequired = await this.documentsService.hasRequiredDocuments(userId);
            return { hasRequired };
        } catch (error) {
            this.logger.error(`Error checking required documents for user ${userId}:`, error);
            throw new HttpException('Failed to check required documents', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
