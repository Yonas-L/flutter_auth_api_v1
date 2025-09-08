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
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Configure multer for memory storage (legacy - now using local storage)
const storage = diskStorage({
    destination: (req, file, cb) => {
        // Use temp directory for legacy Supabase uploads
        cb(null, '/tmp');
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
    private readonly supabase;

    constructor(private readonly documentsService: DocumentsService) {
        // Initialize Supabase client for legacy compatibility
        this.supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
    }

    /**
     * Upload a single document to Supabase Storage (LEGACY - use DocumentsPostgresController)
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

            // Generate unique filename
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const extension = extname(file.originalname);
            const fileName = `${uploadDto.doc_type}-${uniqueSuffix}${extension}`;

            // Create Supabase Storage path: uploads/userId/documents/filename
            const storagePath = `${uploadDto.user_id}/documents/${fileName}`;

            // Upload to Supabase Storage
            const { data: uploadData, error: uploadError } = await this.supabase.storage
                .from('uploads')
                .upload(storagePath, file.buffer, {
                    contentType: file.mimetype,
                    upsert: false
                });

            if (uploadError) {
                this.logger.error('Supabase upload error:', uploadError);
                throw new HttpException('Failed to upload file to storage', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            // Get public URL
            const { data: publicUrlData } = this.supabase.storage
                .from('uploads')
                .getPublicUrl(storagePath);

            // Create document record
            const createDocumentDto: CreateDocumentDto = {
                user_id: uploadDto.user_id,
                doc_type: uploadDto.doc_type,
                file_path: storagePath, // Store Supabase path instead of local path
                file_name: file.originalname,
                file_size_bytes: file.size,
                mime_type: file.mimetype,
                public_url: publicUrlData.publicUrl,
                notes: uploadDto.notes,
            };

            const document = await this.documentsService.create(createDocumentDto);

            // Clean up temporary file
            try {
                fs.unlinkSync(file.path);
            } catch (cleanupError) {
                this.logger.warn('Failed to cleanup temp file:', cleanupError);
            }

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
        @UploadedFiles() files: Express.Multer.File[],
        @Body() uploadDto: any,
    ): Promise<DocumentUploadResponseDto[]> {
        try {
            if (!files || files.length === 0) {
                throw new HttpException('No files uploaded', HttpStatus.BAD_REQUEST);
            }

            const uploadedDocuments: DocumentUploadResponseDto[] = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const docType = uploadDto[`doc_type_${i}`] || 'other';
                const notes = uploadDto[`notes_${i}`] || null;

                // Validate file upload
                const validation = this.documentsService.validateFileUpload(file, docType);
                if (!validation.valid) {
                    this.logger.warn(`Skipping invalid file ${file.originalname}: ${validation.error}`);
                    continue;
                }

                // Generate unique filename
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const extension = extname(file.originalname);
                const fileName = `${docType}-${uniqueSuffix}${extension}`;

                // Create Supabase Storage path: uploads/userId/documents/filename
                const storagePath = `${uploadDto.user_id}/documents/${fileName}`;

                // Upload to Supabase Storage
                const { data: uploadData, error: uploadError } = await this.supabase.storage
                    .from('uploads')
                    .upload(storagePath, file.buffer, {
                        contentType: file.mimetype,
                        upsert: false
                    });

                if (uploadError) {
                    this.logger.error(`Supabase upload error for ${file.originalname}:`, uploadError);
                    continue;
                }

                // Get public URL
                const { data: publicUrlData } = this.supabase.storage
                    .from('uploads')
                    .getPublicUrl(storagePath);

                // Create document record
                const createDocumentDto: CreateDocumentDto = {
                    user_id: uploadDto.user_id,
                    doc_type: docType,
                    file_path: storagePath,
                    file_name: file.originalname,
                    file_size_bytes: file.size,
                    mime_type: file.mimetype,
                    public_url: publicUrlData.publicUrl,
                    notes: notes,
                };

                const document = await this.documentsService.create(createDocumentDto);
                uploadedDocuments.push(new DocumentUploadResponseDto({
                    id: document.id,
                    file_name: document.file_name,
                    file_path: document.file_path,
                    file_size_bytes: document.file_size_bytes,
                    mime_type: document.mime_type,
                    public_url: document.public_url,
                    doc_type: document.doc_type,
                    verification_status: document.verification_status,
                    uploaded_at: document.uploaded_at,
                }));

                // Clean up temporary file
                try {
                    fs.unlinkSync(file.path);
                } catch (cleanupError) {
                    this.logger.warn('Failed to cleanup temp file:', cleanupError);
                }
            }

            return uploadedDocuments;
        } catch (error) {
            this.logger.error('Error uploading multiple documents:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to upload documents', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get current user's documents
     */
    @Get('my-documents/list')
    @UseGuards(AuthGuard('jwt'))
    async getMyDocuments(@Request() req: any): Promise<DocumentResponseDto[]> {
        try {
            const userId = req.user.id;
            const documents = await this.documentsService.findByUserId(userId);
            return documents.map(doc => new DocumentResponseDto(doc));
        } catch (error) {
            this.logger.error('Error getting user documents:', error);
            throw new HttpException('Failed to get documents', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get current user's document summary
     */
    @Get('my-documents/summary')
    @UseGuards(AuthGuard('jwt'))
    async getMyDocumentsSummary(@Request() req: any): Promise<UserDocumentsSummaryDto> {
        try {
            const userId = req.user.id;
            return await this.documentsService.getUserDocumentsSummary(userId);
        } catch (error) {
            this.logger.error('Error getting document summary:', error);
            throw new HttpException('Failed to get document summary', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get document by ID
     */
    @Get(':id')
    @UseGuards(AuthGuard('jwt'))
    async getDocumentById(@Param('id') id: string): Promise<DocumentResponseDto> {
        try {
            const document = await this.documentsService.findById(id);
            return new DocumentResponseDto(document);
        } catch (error) {
            this.logger.error('Error getting document by ID:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to get document', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get documents by type
     */
    @Get('type/:docType')
    @UseGuards(AuthGuard('jwt'))
    async getDocumentsByType(
        @Param('docType') docType: string,
        @Request() req: any,
    ): Promise<DocumentResponseDto[]> {
        try {
            const userId = req.user.id;
            const documents = await this.documentsService.findByUserIdAndType(userId, docType);
            return documents.map(doc => new DocumentResponseDto(doc));
        } catch (error) {
            this.logger.error('Error getting documents by type:', error);
            throw new HttpException('Failed to get documents by type', HttpStatus.INTERNAL_SERVER_ERROR);
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
            return new DocumentResponseDto(document);
        } catch (error) {
            this.logger.error('Error updating document:', error);
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
            // Get document first to get the file path
            const document = await this.documentsService.findById(id);

            // Delete from Supabase Storage
            const { error: storageError } = await this.supabase.storage
                .from('uploads')
                .remove([document.file_path]);

            if (storageError) {
                this.logger.warn('Failed to delete file from storage:', storageError);
                // Continue with database deletion even if storage deletion fails
            }

            // Delete from database
            await this.documentsService.delete(id);

            return { success: true };
        } catch (error) {
            this.logger.error('Error deleting document:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to delete document', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Verify document
     */
    @Put(':id/verify')
    @UseGuards(AuthGuard('jwt'))
    async verifyDocument(
        @Param('id') id: string,
        @Body() verifyDto: DocumentVerifyDto,
    ): Promise<DocumentVerificationDto> {
        try {
            const result = await this.documentsService.verifyDocument(id, verifyDto);
            return result;
        } catch (error) {
            this.logger.error('Error verifying document:', error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Failed to verify document', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get document statistics
     */
    @Get('stats/overview')
    @UseGuards(AuthGuard('jwt'))
    async getDocumentStats(): Promise<DocumentStatsDto> {
        try {
            return await this.documentsService.getDocumentStats();
        } catch (error) {
            this.logger.error('Error getting document stats:', error);
            throw new HttpException('Failed to get document statistics', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get documents by user ID (admin only)
     */
    @Get('user/:userId')
    @UseGuards(AuthGuard('jwt'))
    async getDocumentsByUserId(@Param('userId') userId: string): Promise<DocumentResponseDto[]> {
        try {
            const documents = await this.documentsService.findByUserId(userId);
            return documents.map(doc => new DocumentResponseDto(doc));
        } catch (error) {
            this.logger.error('Error getting documents by user ID:', error);
            throw new HttpException('Failed to get documents by user ID', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}