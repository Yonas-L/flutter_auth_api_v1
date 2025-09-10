import {
    Controller,
    Post,
    Get,
    Delete,
    Param,
    UseInterceptors,
    UploadedFile,
    UploadedFiles,
    Body,
    HttpException,
    HttpStatus,
    Logger,
    Query,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CloudinaryService, CloudinaryUploadResult } from '../storage/cloudinary.service';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentUploadResponseDto } from './dto/document-response.dto';

@Controller('documents/cloudinary')
export class DocumentsCloudinaryController {
    private readonly logger = new Logger(DocumentsCloudinaryController.name);

    constructor(
        private readonly cloudinaryService: CloudinaryService,
        private readonly documentsService: DocumentsService,
    ) { }

    /**
     * Upload avatar/profile picture
     * POST /documents/cloudinary/upload-avatar
     */
    @Post('upload-avatar')
    @UseInterceptors(FileInterceptor('file'))
    async uploadAvatar(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { user_id: string; notes?: string },
    ): Promise<DocumentUploadResponseDto> {
        try {
            if (!file) {
                throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
            }

            this.logger.log(`📤 Uploading avatar for user: ${body.user_id}`);

            // Upload avatar to Cloudinary
            const uploadResult: CloudinaryUploadResult = await this.cloudinaryService.uploadAvatar(
                file,
                body.user_id
            );

            // Create document record in database
            const documentData = {
                user_id: body.user_id,
                doc_type: 'profile_picture',
                file_path: uploadResult.public_id,
                file_name: file.originalname,
                file_size_bytes: file.size,
                mime_type: file.mimetype,
                public_url: uploadResult.secure_url,
                verification_status: 'pending_review' as const,
                notes: body.notes,
            };

            // Use createOrReplaceAvatar to ensure only one avatar per user
            const document = await this.documentsService.createOrReplaceAvatar(documentData);

            this.logger.log(`✅ Avatar uploaded successfully: ${document.id}`);

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
                message: 'Avatar uploaded successfully to Cloudinary',
            };
        } catch (error) {
            this.logger.error(`❌ Error uploading avatar: ${error.message}`);
            throw new HttpException(
                `Failed to upload avatar: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Upload a single document to Cloudinary
     * POST /documents/cloudinary/upload
     */
    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadDocument(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: any,
    ): Promise<DocumentUploadResponseDto> {
        try {
            if (!file) {
                throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
            }

            // Extract data from form body
            const userId = body.user_id;
            const docType = body.doc_type;
            const notes = body.notes;

            if (!userId || !docType) {
                throw new HttpException('Missing required fields: user_id and doc_type', HttpStatus.BAD_REQUEST);
            }

            this.logger.log(`📤 Uploading document: ${file.originalname} for user: ${userId}`);

            // Use specialized upload method based on document type
            let uploadResult: CloudinaryUploadResult;

            if (docType === 'profile_picture') {
                // Use avatar upload for profile pictures
                uploadResult = await this.cloudinaryService.uploadAvatar(file, userId);
            } else {
                // Use document upload for other document types
                uploadResult = await this.cloudinaryService.uploadDocument(
                    file,
                    userId,
                    docType
                );
            }

            // Create document record in database
            const documentData = {
                user_id: userId,
                doc_type: docType,
                file_path: uploadResult.public_id, // Store Cloudinary public_id
                file_name: file.originalname,
                file_size_bytes: file.size,
                mime_type: file.mimetype,
                public_url: uploadResult.secure_url, // Store Cloudinary URL
                verification_status: 'pending_review' as const,
                notes: notes,
            };

            // Use createOrReplaceAvatar for profile pictures to ensure only one avatar per user
            const document = docType === 'profile_picture'
                ? await this.documentsService.createOrReplaceAvatar(documentData)
                : await this.documentsService.create(documentData);

            this.logger.log(`✅ Document uploaded successfully: ${document.id}`);

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
                message: 'Document uploaded successfully to Cloudinary',
            };
        } catch (error) {
            this.logger.error(`❌ Error uploading document: ${error.message}`);
            throw new HttpException(
                `Failed to upload document: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Upload user registration files (avatar + 3 documents)
     * POST /documents/cloudinary/upload-registration
     */
    @Post('upload-registration')
    @UseInterceptors(FilesInterceptor('files', 4)) // Avatar + 3 documents
    async uploadUserRegistration(
        @UploadedFiles() files: Express.Multer.File[],
        @Body() body: { user_id: string; notes?: string },
    ): Promise<{
        avatar: DocumentUploadResponseDto;
        documents: DocumentUploadResponseDto[];
        errors: string[];
    }> {
        try {
            if (!files || files.length !== 4) {
                throw new HttpException('Exactly 4 files required: 1 avatar + 3 documents', HttpStatus.BAD_REQUEST);
            }

            this.logger.log(`📤 Uploading registration files for user: ${body.user_id}`);

            // Separate avatar (first file) and documents (last 3 files)
            const avatarFile = files[0];
            const documentFiles = files.slice(1);

            // Use specialized registration upload method
            const uploadResults = await this.cloudinaryService.uploadUserRegistrationFiles(
                avatarFile,
                documentFiles,
                body.user_id
            );

            const documents: DocumentUploadResponseDto[] = [];
            const errors: string[] = [];

            // Process avatar
            try {
                const avatarData = {
                    user_id: body.user_id,
                    doc_type: 'profile_picture',
                    file_path: uploadResults.avatar.public_id,
                    file_name: avatarFile.originalname,
                    file_size_bytes: avatarFile.size,
                    mime_type: avatarFile.mimetype,
                    public_url: uploadResults.avatar.secure_url,
                    verification_status: 'pending_review' as const,
                    notes: body.notes,
                };

                const avatarDocument = await this.documentsService.create(avatarData);

                const avatarResponse: DocumentUploadResponseDto = {
                    id: avatarDocument.id,
                    user_id: avatarDocument.user_id,
                    doc_type: avatarDocument.doc_type,
                    file_name: avatarDocument.file_name,
                    file_path: avatarDocument.file_path,
                    file_size_bytes: avatarDocument.file_size_bytes,
                    mime_type: avatarDocument.mime_type,
                    public_url: avatarDocument.public_url,
                    verification_status: avatarDocument.verification_status,
                    notes: avatarDocument.notes,
                    uploaded_at: avatarDocument.uploaded_at,
                    message: 'Avatar uploaded successfully to Cloudinary',
                };

                // Process documents
                const requiredDocTypes = ['driver_license', 'vehicle_registration', 'insurance'];
                for (let i = 0; i < uploadResults.documents.length; i++) {
                    try {
                        const uploadResult = uploadResults.documents[i];
                        const docType = requiredDocTypes[i];

                        const documentData = {
                            user_id: body.user_id,
                            doc_type: docType,
                            file_path: uploadResult.public_id,
                            file_name: documentFiles[i].originalname,
                            file_size_bytes: documentFiles[i].size,
                            mime_type: documentFiles[i].mimetype,
                            public_url: uploadResult.secure_url,
                            verification_status: 'pending_review' as const,
                            notes: body.notes,
                        };

                        const document = await this.documentsService.create(documentData);

                        documents.push({
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
                            message: 'Document uploaded successfully to Cloudinary',
                        });
                    } catch (error) {
                        const errorMsg = `Failed to process document ${documentFiles[i].originalname}: ${error.message}`;
                        errors.push(errorMsg);
                        this.logger.error(`❌ ${errorMsg}`);
                    }
                }

                this.logger.log(`✅ Registration files uploaded successfully for user: ${body.user_id}`);

                return {
                    avatar: avatarResponse,
                    documents,
                    errors
                };
            } catch (error) {
                const errorMsg = `Failed to process avatar: ${error.message}`;
                errors.push(errorMsg);
                this.logger.error(`❌ ${errorMsg}`);
                throw new HttpException(errorMsg, HttpStatus.INTERNAL_SERVER_ERROR);
            }
        } catch (error) {
            this.logger.error(`❌ Error uploading registration files: ${error.message}`);
            throw new HttpException(
                `Failed to upload registration files: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Upload driver registration documents (3 required documents)
     * POST /documents/cloudinary/upload-driver-docs
     */
    @Post('upload-driver-docs')
    @UseInterceptors(FilesInterceptor('files', 3)) // Exactly 3 files for driver registration
    async uploadDriverDocuments(
        @UploadedFiles() files: Express.Multer.File[],
        @Body() body: { user_id: string; notes?: string },
    ): Promise<{ documents: DocumentUploadResponseDto[]; errors: string[] }> {
        try {
            if (!files || files.length !== 3) {
                throw new HttpException('Exactly 3 files required for driver registration', HttpStatus.BAD_REQUEST);
            }

            // Define the 3 required document types for driver registration
            const requiredDocTypes = ['driver_license', 'vehicle_registration', 'insurance'];

            this.logger.log(`📤 Uploading driver documents for user: ${body.user_id}`);

            // Use specialized driver document upload method
            const uploadResults = await this.cloudinaryService.uploadDriverDocuments(
                files,
                body.user_id,
                requiredDocTypes
            );

            const documents: DocumentUploadResponseDto[] = [];
            const errors: string[] = [];

            // Process each uploaded file
            for (let i = 0; i < uploadResults.length; i++) {
                try {
                    const uploadResult = uploadResults[i];
                    const docType = requiredDocTypes[i];

                    // Create document record in database
                    const documentData = {
                        user_id: body.user_id,
                        doc_type: docType,
                        file_path: uploadResult.public_id,
                        file_name: files[i].originalname,
                        file_size_bytes: files[i].size,
                        mime_type: files[i].mimetype,
                        public_url: uploadResult.secure_url,
                        verification_status: 'pending_review' as const,
                        notes: body.notes,
                    };

                    const document = await this.documentsService.create(documentData);

                    documents.push({
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
                        message: 'Driver document uploaded successfully to Cloudinary',
                    });
                } catch (error) {
                    const errorMsg = `Failed to process document ${files[i].originalname}: ${error.message}`;
                    errors.push(errorMsg);
                    this.logger.error(`❌ ${errorMsg}`);
                }
            }

            this.logger.log(`✅ Uploaded ${documents.length} driver documents, ${errors.length} errors`);

            return { documents, errors };
        } catch (error) {
            this.logger.error(`❌ Error uploading driver documents: ${error.message}`);
            throw new HttpException(
                `Failed to upload driver documents: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Upload multiple documents to Cloudinary
     * POST /documents/cloudinary/upload-multiple
     */
    @Post('upload-multiple')
    @UseInterceptors(FilesInterceptor('files', 10)) // Max 10 files
    async uploadMultipleDocuments(
        @UploadedFiles() files: Express.Multer.File[],
        @Body() body: { user_id: string; doc_types: string[]; notes?: string },
    ): Promise<{ documents: DocumentUploadResponseDto[]; errors: string[] }> {
        try {
            if (!files || files.length === 0) {
                throw new HttpException('No files provided', HttpStatus.BAD_REQUEST);
            }

            if (!body.doc_types || body.doc_types.length !== files.length) {
                throw new HttpException('Document types must match number of files', HttpStatus.BAD_REQUEST);
            }

            this.logger.log(`📤 Uploading ${files.length} documents for user: ${body.user_id}`);

            const documents: DocumentUploadResponseDto[] = [];
            const errors: string[] = [];

            // Process each file
            for (let i = 0; i < files.length; i++) {
                try {
                    const file = files[i];
                    const docType = body.doc_types[i];

                    // Use specialized upload method based on document type
                    let uploadResult: CloudinaryUploadResult;

                    if (docType === 'profile_picture') {
                        uploadResult = await this.cloudinaryService.uploadAvatar(file, body.user_id);
                    } else {
                        uploadResult = await this.cloudinaryService.uploadDocument(file, body.user_id, docType);
                    }

                    // Create document record in database
                    const documentData = {
                        user_id: body.user_id,
                        doc_type: docType,
                        file_path: uploadResult.public_id,
                        file_name: file.originalname,
                        file_size_bytes: file.size,
                        mime_type: file.mimetype,
                        public_url: uploadResult.secure_url,
                        verification_status: 'pending_review' as const,
                        notes: body.notes,
                    };

                    const document = await this.documentsService.create(documentData);

                    documents.push({
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
                        message: 'Document uploaded successfully to Cloudinary',
                    });
                } catch (error) {
                    const errorMsg = `Failed to upload file ${files[i].originalname}: ${error.message}`;
                    errors.push(errorMsg);
                    this.logger.error(`❌ ${errorMsg}`);
                }
            }

            this.logger.log(`✅ Uploaded ${documents.length} documents, ${errors.length} errors`);

            return { documents, errors };
        } catch (error) {
            this.logger.error(`❌ Error uploading multiple documents: ${error.message}`);
            throw new HttpException(
                `Failed to upload documents: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get user's files from Cloudinary
     * GET /documents/cloudinary/user/:userId/files
     */
    @Get('user/:userId/files')
    async getUserFiles(@Param('userId') userId: string): Promise<{
        avatars: any[];
        documents: any[];
        folderStructure: {
            baseFolder: string;
            avatarFolder: string;
            documentsFolder: string;
        };
    }> {
        try {
            this.logger.log(`📁 Getting files for user: ${userId}`);

            const files = await this.cloudinaryService.getUserFiles(userId);
            const folderStructure = this.cloudinaryService.getUserFolderStructure(userId);

            return {
                ...files,
                folderStructure
            };
        } catch (error) {
            this.logger.error(`❌ Error getting user files: ${error.message}`);
            throw new HttpException(
                `Failed to get user files: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Delete all user files (for account deletion)
     * DELETE /documents/cloudinary/user/:userId/files
     */
    @Delete('user/:userId/files')
    async deleteUserFiles(@Param('userId') userId: string): Promise<{
        deleted: string[];
        failed: string[];
        message: string;
    }> {
        try {
            this.logger.log(`🗑️ Deleting all files for user: ${userId}`);

            const result = await this.cloudinaryService.deleteUserFiles(userId);

            return {
                ...result,
                message: `Deleted ${result.deleted.length} files, ${result.failed.length} failed`
            };
        } catch (error) {
            this.logger.error(`❌ Error deleting user files: ${error.message}`);
            throw new HttpException(
                `Failed to delete user files: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Health check for Cloudinary
     * GET /documents/cloudinary/health
     */
    @Get('health')
    async healthCheck(): Promise<{ status: string; cloudinary: any }> {
        try {
            const cloudinaryHealth = await this.cloudinaryService.healthCheck();

            return {
                status: 'ok',
                cloudinary: cloudinaryHealth,
            };
        } catch (error) {
            this.logger.error(`❌ Health check failed: ${error.message}`);
            return {
                status: 'error',
                cloudinary: { error: error.message },
            };
        }
    }

    /**
     * Get document by ID
     * GET /documents/cloudinary/:id
     */
    @Get(':id')
    async getDocument(@Param('id') id: string): Promise<DocumentUploadResponseDto> {
        try {
            const document = await this.documentsService.findById(id);

            if (!document) {
                throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
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
            };
        } catch (error) {
            this.logger.error(`❌ Error getting document ${id}: ${error.message}`);
            throw new HttpException(
                `Failed to get document: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get documents by user ID
     * GET /documents/cloudinary/user/:userId
     */
    @Get('user/:userId')
    async getDocumentsByUser(@Param('userId') userId: string): Promise<DocumentUploadResponseDto[]> {
        try {
            const documents = await this.documentsService.findByUserId(userId);

            return documents.map(doc => ({
                id: doc.id,
                user_id: doc.user_id,
                doc_type: doc.doc_type,
                file_name: doc.file_name,
                file_path: doc.file_path,
                file_size_bytes: doc.file_size_bytes,
                mime_type: doc.mime_type,
                public_url: doc.public_url,
                verification_status: doc.verification_status,
                notes: doc.notes,
                uploaded_at: doc.uploaded_at,
            }));
        } catch (error) {
            this.logger.error(`❌ Error getting documents for user ${userId}: ${error.message}`);
            throw new HttpException(
                `Failed to get documents: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Delete document by ID
     * DELETE /documents/cloudinary/:id
     */
    @Delete(':id')
    async deleteDocument(@Param('id') id: string): Promise<{ message: string }> {
        try {
            const document = await this.documentsService.findById(id);

            if (!document) {
                throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
            }

            // Delete from Cloudinary
            const cloudinaryDeleted = await this.cloudinaryService.deleteFile(document.file_path);

            if (!cloudinaryDeleted) {
                this.logger.warn(`⚠️ Failed to delete file from Cloudinary: ${document.file_path}`);
            }

            // Delete from database
            await this.documentsService.delete(id);

            this.logger.log(`✅ Document deleted successfully: ${id}`);

            return { message: 'Document deleted successfully' };
        } catch (error) {
            this.logger.error(`❌ Error deleting document ${id}: ${error.message}`);
            throw new HttpException(
                `Failed to delete document: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get optimized image URL
     * GET /documents/cloudinary/:id/optimized
     */
    @Get(':id/optimized')
    async getOptimizedUrl(
        @Param('id') id: string,
        @Query('width') width?: string,
        @Query('height') height?: string,
        @Query('quality') quality?: string,
        @Query('format') format?: string,
    ): Promise<{ optimized_url: string; original_url: string }> {
        try {
            const document = await this.documentsService.findById(id);

            if (!document) {
                throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
            }

            const optimizedUrl = this.cloudinaryService.generateOptimizedUrl(document.file_path, {
                width: width ? parseInt(width) : undefined,
                height: height ? parseInt(height) : undefined,
                quality: quality || 'auto',
                format: format || 'auto',
            });

            return {
                optimized_url: optimizedUrl,
                original_url: document.public_url || '',
            };
        } catch (error) {
            this.logger.error(`❌ Error getting optimized URL for document ${id}: ${error.message}`);
            throw new HttpException(
                `Failed to get optimized URL: ${error.message}`,
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }


    /**
     * Get folder name for document type
     */
    private getFolderForDocumentType(docType: string): string {
        const folderMap: { [key: string]: string } = {
            'driver_license': 'licenses',
            'vehicle_registration': 'registrations',
            'insurance': 'insurance',
            'profile_picture': 'profiles',
            'vehicle_photo': 'vehicles',
            'other': 'misc',
        };

        return folderMap[docType] || 'misc';
    }
}
