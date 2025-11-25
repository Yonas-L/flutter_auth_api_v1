import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

export interface CloudinaryUploadResult {
    public_id: string;
    secure_url: string;
    url: string;
    width: number;
    height: number;
    format: string;
    resource_type: string;
    bytes: number;
    created_at: string;
}

export interface CloudinaryUploadOptions {
    folder?: string;
    public_id?: string;
    transformation?: any;
    resource_type?: 'image' | 'video' | 'raw' | 'auto';
    quality?: string | number;
    format?: string;
}

@Injectable()
export class CloudinaryService {
    private readonly logger = new Logger(CloudinaryService.name);

    constructor(private readonly configService: ConfigService) {
        // Configure Cloudinary
        cloudinary.config({
            cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
            api_key: this.configService.get<string>('CLOUDINARY_KEY'),
            api_secret: this.configService.get<string>('CLOUDINARY_SECRET'),
        });

        this.logger.log('☁️ Cloudinary service initialized');
    }

    /**
     * Upload a file to Cloudinary
     */
    async uploadFile(
        file: Express.Multer.File,
        options: CloudinaryUploadOptions = {}
    ): Promise<CloudinaryUploadResult> {
        try {
            this.logger.log(`📤 Uploading file: ${file.originalname}`);

            const uploadOptions = {
                folder: options.folder || 'arada-transport',
                resource_type: options.resource_type || 'auto',
                quality: options.quality || 'auto',
                ...options,
            };

            // Upload file to Cloudinary
            // Handle case where file.buffer might be undefined (common in some Multer configurations)
            let fileData: string;

            if (file.buffer) {
                // Use buffer if available
                fileData = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
            } else if (file.path) {
                // Use file path if buffer is not available
                fileData = file.path;
            } else {
                throw new Error('No file data available - neither buffer nor path found');
            }

            const result = await cloudinary.uploader.upload(fileData, uploadOptions);

            this.logger.log(`✅ File uploaded successfully: ${result.public_id}`);
            this.logger.log(`🔗 Public URL: ${result.secure_url}`);

            return {
                public_id: result.public_id,
                secure_url: result.secure_url,
                url: result.url,
                width: result.width,
                height: result.height,
                format: result.format,
                resource_type: result.resource_type,
                bytes: result.bytes,
                created_at: result.created_at,
            };
        } catch (error) {
            this.logger.error(`❌ Error uploading file: ${error.message}`);
            throw new Error(`Failed to upload file: ${error.message}`);
        }
    }

    /**
     * Upload multiple files to Cloudinary
     */
    async uploadMultipleFiles(
        files: Express.Multer.File[],
        options: CloudinaryUploadOptions = {}
    ): Promise<CloudinaryUploadResult[]> {
        try {
            this.logger.log(`📤 Uploading ${files.length} files`);

            const uploadPromises = files.map((file, index) => {
                const fileOptions = {
                    ...options,
                    public_id: options.public_id ? `${options.public_id}_${index}` : undefined,
                };
                return this.uploadFile(file, fileOptions);
            });

            const results = await Promise.all(uploadPromises);
            this.logger.log(`✅ All ${files.length} files uploaded successfully`);

            return results;
        } catch (error) {
            this.logger.error(`❌ Error uploading multiple files: ${error.message}`);
            throw new Error(`Failed to upload files: ${error.message}`);
        }
    }

    /**
     * Delete a file from Cloudinary
     */
    async deleteFile(publicId: string): Promise<boolean> {
        try {
            this.logger.log(`🗑️ Deleting file: ${publicId}`);

            const result = await cloudinary.uploader.destroy(publicId);

            if (result.result === 'ok') {
                this.logger.log(`✅ File deleted successfully: ${publicId}`);
                return true;
            } else {
                this.logger.warn(`⚠️ File deletion result: ${result.result}`);
                return false;
            }
        } catch (error) {
            this.logger.error(`❌ Error deleting file ${publicId}: ${error.message}`);
            throw new Error(`Failed to delete file: ${error.message}`);
        }
    }

    /**
     * Delete multiple files from Cloudinary
     */
    async deleteMultipleFiles(publicIds: string[]): Promise<{ deleted: string[]; failed: string[] }> {
        try {
            this.logger.log(`🗑️ Deleting ${publicIds.length} files`);

            const deletePromises = publicIds.map(async (publicId) => {
                try {
                    const success = await this.deleteFile(publicId);
                    return { publicId, success };
                } catch (error) {
                    return { publicId, success: false, error: error.message };
                }
            });

            const results = await Promise.all(deletePromises);

            const deleted = results.filter(r => r.success).map(r => r.publicId as string);
            const failed = results.filter(r => !r.success).map(r => r.publicId as string);

            this.logger.log(`✅ Deleted ${deleted.length} files, ${failed.length} failed`);

            return { deleted, failed };
        } catch (error) {
            this.logger.error(`❌ Error deleting multiple files: ${error.message}`);
            throw new Error(`Failed to delete files: ${error.message}`);
        }
    }

    /**
     * Get file information from Cloudinary
     */
    async getFileInfo(publicId: string): Promise<any> {
        try {
            this.logger.log(`ℹ️ Getting file info: ${publicId}`);

            const result = await cloudinary.api.resource(publicId);
            return result;
        } catch (error) {
            this.logger.error(`❌ Error getting file info ${publicId}: ${error.message}`);
            throw new Error(`Failed to get file info: ${error.message}`);
        }
    }

    /**
     * Generate optimized URL for different use cases
     */
    generateOptimizedUrl(
        publicId: string,
        options: {
            width?: number;
            height?: number;
            quality?: string;
            format?: string;
            crop?: string;
            gravity?: string;
        } = {}
    ): string {
        const {
            width,
            height,
            quality = 'auto',
            format = 'auto',
            crop = 'fill',
            gravity = 'auto'
        } = options;

        const transformation: string[] = [];

        if (width || height) {
            transformation.push(`w_${width || 'auto'},h_${height || 'auto'},c_${crop},g_${gravity}`);
        }

        if (quality !== 'auto') {
            transformation.push(`q_${quality}`);
        }

        if (format !== 'auto') {
            transformation.push(`f_${format}`);
        }

        const transformationString = transformation.length > 0 ? transformation.join(',') : '';

        return cloudinary.url(publicId, {
            secure: true,
            transformation: transformationString ? [transformationString] : undefined,
        });
    }

    /**
     * Upload avatar image (optimized for profile pictures)
     * Structure: uploads/{userId}/avatar/avatar_{timestamp}
     */
    async uploadAvatar(
        file: Express.Multer.File,
        userId: string
    ): Promise<CloudinaryUploadResult> {
        try {
            this.logger.log(`📤 Uploading avatar for user: ${userId}`);

            // Validate file type for images
            if (!file.mimetype.startsWith('image/')) {
                throw new Error('Avatar must be an image file');
            }

            const uploadOptions: CloudinaryUploadOptions = {
                folder: `uploads/${userId}/avatar`,
                public_id: `avatar_${Date.now()}`,
                resource_type: 'image',
                quality: 'auto',
                transformation: [
                    { width: 400, height: 400, crop: 'fill', gravity: 'face' },
                    { quality: 'auto', fetch_format: 'auto' }
                ]
            };

            return await this.uploadFile(file, uploadOptions);
        } catch (error) {
            this.logger.error(`❌ Error uploading avatar: ${error.message}`);
            throw new Error(`Failed to upload avatar: ${error.message}`);
        }
    }

    /**
     * Upload document (PDF, DOCX, etc.)
     * Structure: uploads/{userId}/documents/{docType}_{timestamp}
     */
    async uploadDocument(
        file: Express.Multer.File,
        userId: string,
        docType: string,
        existingPublicId?: string
    ): Promise<CloudinaryUploadResult> {
        try {
            this.logger.log(`📤 Uploading document: ${file.originalname} for user: ${userId}`);

            // Validate file type for documents
            const allowedTypes = [
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
                'application/msword', // DOC
                'image/jpeg',
                'image/jpg',
                'image/png',
                'image/webp',
                'application/octet-stream' // Generic binary, often used by mobile apps for images
            ];

            if (!allowedTypes.includes(file.mimetype)) {
                throw new Error(`File type ${file.mimetype} is not allowed for documents`);
            }

            // If an existing public_id is provided, overwrite the same asset
            // Otherwise, use a deterministic public_id per user+docType so future uploads can overwrite
            const deterministicPublicId = `uploads/${userId}/documents/${docType}`;

            // Determine resource type - check file extension for octet-stream
            let resourceType: 'image' | 'raw' = 'raw';
            if (file.mimetype.startsWith('image/')) {
                resourceType = 'image';
            } else if (file.mimetype === 'application/octet-stream') {
                // Check file extension for images
                const ext = file.originalname.split('.').pop()?.toLowerCase();
                if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
                    resourceType = 'image';
                }
            }

            const uploadOptions: CloudinaryUploadOptions = {
                folder: `uploads/${userId}/documents`,
                public_id: existingPublicId || deterministicPublicId,
                resource_type: resourceType,
                quality: resourceType === 'image' ? 'auto' : undefined,
            };

            return await this.uploadFile(file, uploadOptions);
        } catch (error) {
            this.logger.error(`❌ Error uploading document: ${error.message}`);
            throw new Error(`Failed to upload document: ${error.message}`);
        }
    }

    /**
     * Upload multiple documents for driver registration
     * Structure: uploads/{userId}/documents/{docType}_{timestamp}
     */
    async uploadDriverDocuments(
        files: Express.Multer.File[],
        userId: string,
        docTypes: string[]
    ): Promise<CloudinaryUploadResult[]> {
        try {
            if (files.length !== docTypes.length) {
                throw new Error('Number of files must match number of document types');
            }

            this.logger.log(`📤 Uploading ${files.length} driver documents for user: ${userId}`);

            const uploadPromises = files.map((file, index) => {
                return this.uploadDocument(file, userId, docTypes[index]);
            });

            const results = await Promise.all(uploadPromises);
            this.logger.log(`✅ All ${files.length} driver documents uploaded successfully`);

            return results;
        } catch (error) {
            this.logger.error(`❌ Error uploading driver documents: ${error.message}`);
            throw new Error(`Failed to upload driver documents: ${error.message}`);
        }
    }

    /**
     * Upload user registration files (avatar + 3 documents)
     * Structure: uploads/{userId}/avatar/ and uploads/{userId}/documents/
     */
    async uploadUserRegistrationFiles(
        avatarFile: Express.Multer.File,
        documentFiles: Express.Multer.File[],
        userId: string
    ): Promise<{
        avatar: CloudinaryUploadResult;
        documents: CloudinaryUploadResult[];
    }> {
        try {
            this.logger.log(`📤 Uploading registration files for user: ${userId}`);

            // Upload avatar
            const avatarResult = await this.uploadAvatar(avatarFile, userId);

            // Upload documents (driver_license, vehicle_registration, insurance)
            const requiredDocTypes = ['driver_license', 'vehicle_registration', 'insurance'];
            const documentResults = await this.uploadDriverDocuments(documentFiles, userId, requiredDocTypes);

            this.logger.log(`✅ Registration files uploaded successfully for user: ${userId}`);

            return {
                avatar: avatarResult,
                documents: documentResults
            };
        } catch (error) {
            this.logger.error(`❌ Error uploading registration files: ${error.message}`);
            throw new Error(`Failed to upload registration files: ${error.message}`);
        }
    }

    /**
     * Get user's folder structure
     * Structure: uploads/{userId}/avatar/ and uploads/{userId}/documents/
     */
    getUserFolderStructure(userId: string): {
        avatarFolder: string;
        documentsFolder: string;
        baseFolder: string;
    } {
        return {
            baseFolder: `uploads/${userId}`,
            avatarFolder: `uploads/${userId}/avatar`,
            documentsFolder: `uploads/${userId}/documents`
        };
    }

    /**
     * Get all files for a user (for frontend listing)
     */
    async getUserFiles(userId: string): Promise<{
        avatars: any[];
        documents: any[];
    }> {
        try {
            this.logger.log(`📁 Getting files for user: ${userId}`);

            const { avatarFolder, documentsFolder } = this.getUserFolderStructure(userId);

            // Get avatar files
            const avatarFiles = await cloudinary.api.resources({
                type: 'upload',
                prefix: avatarFolder,
                max_results: 50
            });

            // Get document files
            const documentFiles = await cloudinary.api.resources({
                type: 'upload',
                prefix: documentsFolder,
                max_results: 100
            });

            return {
                avatars: avatarFiles.resources || [],
                documents: documentFiles.resources || []
            };
        } catch (error) {
            this.logger.error(`❌ Error getting user files: ${error.message}`);
            throw new Error(`Failed to get user files: ${error.message}`);
        }
    }

    /**
     * Delete all files for a user (for account deletion)
     */
    async deleteUserFiles(userId: string): Promise<{
        deleted: string[];
        failed: string[];
    }> {
        try {
            this.logger.log(`🗑️ Deleting all files for user: ${userId}`);

            const { avatarFolder, documentsFolder } = this.getUserFolderStructure(userId);
            const publicIds: string[] = [];

            // Get all avatar files
            const avatarFiles = await cloudinary.api.resources({
                type: 'upload',
                prefix: avatarFolder,
                max_results: 500
            });

            // Get all document files
            const documentFiles = await cloudinary.api.resources({
                type: 'upload',
                prefix: documentsFolder,
                max_results: 500
            });

            // Collect all public IDs
            [...(avatarFiles.resources || []), ...(documentFiles.resources || [])].forEach(file => {
                publicIds.push(file.public_id);
            });

            // Delete all files
            const result = await this.deleteMultipleFiles(publicIds);

            this.logger.log(`✅ Deleted ${result.deleted.length} files for user: ${userId}`);

            return result;
        } catch (error) {
            this.logger.error(`❌ Error deleting user files: ${error.message}`);
            throw new Error(`Failed to delete user files: ${error.message}`);
        }
    }

    /**
     * Generate avatar URL with specific transformations
     */
    generateAvatarUrl(publicId: string, size: number = 200): string {
        return this.generateOptimizedUrl(publicId, {
            width: size,
            height: size,
            crop: 'fill',
            gravity: 'face',
            quality: 'auto',
            format: 'auto'
        });
    }

    /**
     * Generate document URL (no transformations for documents)
     */
    generateDocumentUrl(publicId: string): string {
        return this.generateOptimizedUrl(publicId, {
            quality: 'auto',
            format: 'auto'
        });
    }

    /**
     * Health check for Cloudinary connection
     */
    async healthCheck(): Promise<{ status: string; cloudName?: string; error?: string }> {
        try {
            // Test connection by getting account info
            const result = await cloudinary.api.ping();

            return {
                status: 'ok',
                cloudName: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
            };
        } catch (error) {
            this.logger.error(`❌ Cloudinary health check failed: ${error.message}`);
            return {
                status: 'error',
                error: error.message,
            };
        }
    }
}
