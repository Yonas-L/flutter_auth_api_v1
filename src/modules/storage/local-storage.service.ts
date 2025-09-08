import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface FileUploadResult {
    success: boolean;
    filePath: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    publicUrl: string;
    error?: string;
}

export interface FileDeleteResult {
    success: boolean;
    error?: string;
}

@Injectable()
export class LocalStorageService {
    private readonly logger = new Logger(LocalStorageService.name);
    private readonly uploadsDir: string;
    private readonly baseUrl: string;

    constructor() {
        // Set uploads directory (relative to project root)
        this.uploadsDir = path.join(process.cwd(), 'uploads');
        this.baseUrl = process.env.BASE_URL || 'http://localhost:8080';

        // Ensure uploads directory exists
        this.ensureUploadsDirectory();
    }

    /**
     * Ensure uploads directory exists
     */
    private ensureUploadsDirectory(): void {
        try {
            if (!fs.existsSync(this.uploadsDir)) {
                fs.mkdirSync(this.uploadsDir, { recursive: true });
                this.logger.log(`📁 Created uploads directory: ${this.uploadsDir}`);
            }
        } catch (error) {
            this.logger.error('Failed to create uploads directory:', error);
            throw new HttpException('Storage initialization failed', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Generate unique filename
     */
    private generateUniqueFileName(originalName: string): string {
        const ext = path.extname(originalName);
        const name = path.basename(originalName, ext);
        const hash = crypto.randomBytes(16).toString('hex');
        const timestamp = Date.now();
        return `${name}-${timestamp}-${hash}${ext}`;
    }

    /**
     * Create user-specific directory
     */
    private createUserDirectory(userId: string): string {
        const userDir = path.join(this.uploadsDir, userId);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        return userDir;
    }

    /**
     * Upload file to local storage
     */
    async uploadFile(
        file: Express.Multer.File,
        userId: string,
        subfolder: string = 'documents'
    ): Promise<FileUploadResult> {
        try {
            // Validate file
            if (!file || !file.buffer) {
                throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
            }

            // Create user directory
            const userDir = this.createUserDirectory(userId);
            const targetDir = path.join(userDir, subfolder);

            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // Generate unique filename
            const fileName = this.generateUniqueFileName(file.originalname);
            const filePath = path.join(targetDir, fileName);

            // Write file to disk
            await fs.promises.writeFile(filePath, file.buffer);

            // Generate public URL
            const publicUrl = `${this.baseUrl}/api/files/${userId}/${subfolder}/${fileName}`;

            this.logger.log(`✅ File uploaded successfully: ${filePath}`);

            return {
                success: true,
                filePath,
                fileName,
                fileSize: file.size,
                mimeType: file.mimetype,
                publicUrl,
            };
        } catch (error) {
            this.logger.error('File upload failed:', error);
            return {
                success: false,
                filePath: '',
                fileName: '',
                fileSize: 0,
                mimeType: '',
                publicUrl: '',
                error: error instanceof Error ? error.message : 'Upload failed',
            };
        }
    }

    /**
     * Delete file from local storage
     */
    async deleteFile(filePath: string): Promise<FileDeleteResult> {
        try {
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
                this.logger.log(`✅ File deleted successfully: ${filePath}`);
                return { success: true };
            } else {
                this.logger.warn(`File not found: ${filePath}`);
                return { success: true }; // Consider it successful if file doesn't exist
            }
        } catch (error) {
            this.logger.error('File deletion failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Deletion failed',
            };
        }
    }

    /**
     * Get file info
     */
    async getFileInfo(filePath: string): Promise<{
        exists: boolean;
        size?: number;
        mimeType?: string;
        lastModified?: Date;
    }> {
        try {
            if (!fs.existsSync(filePath)) {
                return { exists: false };
            }

            const stats = await fs.promises.stat(filePath);
            const ext = path.extname(filePath).toLowerCase();

            // Simple MIME type detection
            const mimeTypes: Record<string, string> = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.pdf': 'application/pdf',
                '.doc': 'application/msword',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            };

            return {
                exists: true,
                size: stats.size,
                mimeType: mimeTypes[ext] || 'application/octet-stream',
                lastModified: stats.mtime,
            };
        } catch (error) {
            this.logger.error('Failed to get file info:', error);
            return { exists: false };
        }
    }

    /**
     * Read file content
     */
    async readFile(filePath: string): Promise<Buffer | null> {
        try {
            if (!fs.existsSync(filePath)) {
                return null;
            }
            return await fs.promises.readFile(filePath);
        } catch (error) {
            this.logger.error('Failed to read file:', error);
            return null;
        }
    }

    /**
     * Get storage statistics
     */
    async getStorageStats(userId?: string): Promise<{
        totalFiles: number;
        totalSize: number;
        averageFileSize: number;
        filesByType: Record<string, number>;
        sizeByType: Record<string, number>;
    }> {
        try {
            const searchDir = userId ? path.join(this.uploadsDir, userId) : this.uploadsDir;

            if (!fs.existsSync(searchDir)) {
                return {
                    totalFiles: 0,
                    totalSize: 0,
                    averageFileSize: 0,
                    filesByType: {},
                    sizeByType: {},
                };
            }

            const files = await this.getAllFiles(searchDir);
            const totalFiles = files.length;
            const totalSize = files.reduce((sum, file) => sum + file.size, 0);
            const averageFileSize = totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0;

            const filesByType: Record<string, number> = {};
            const sizeByType: Record<string, number> = {};

            files.forEach(file => {
                const ext = path.extname(file.name).toLowerCase() || 'unknown';
                filesByType[ext] = (filesByType[ext] || 0) + 1;
                sizeByType[ext] = (sizeByType[ext] || 0) + file.size;
            });

            return {
                totalFiles,
                totalSize,
                averageFileSize,
                filesByType,
                sizeByType,
            };
        } catch (error) {
            this.logger.error('Failed to get storage stats:', error);
            throw error;
        }
    }

    /**
     * Get all files in directory recursively
     */
    private async getAllFiles(dir: string): Promise<Array<{ name: string; size: number; path: string }>> {
        const files: Array<{ name: string; size: number; path: string }> = [];

        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    const subFiles = await this.getAllFiles(fullPath);
                    files.push(...subFiles);
                } else {
                    const stats = await fs.promises.stat(fullPath);
                    files.push({
                        name: entry.name,
                        size: stats.size,
                        path: fullPath,
                    });
                }
            }
        } catch (error) {
            this.logger.error(`Failed to read directory ${dir}:`, error);
        }

        return files;
    }

    /**
     * Clean up old files (older than specified days)
     */
    async cleanupOldFiles(olderThanDays: number = 30): Promise<number> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

            const files = await this.getAllFiles(this.uploadsDir);
            let deletedCount = 0;

            for (const file of files) {
                const stats = await fs.promises.stat(file.path);
                if (stats.mtime < cutoffDate) {
                    try {
                        await fs.promises.unlink(file.path);
                        deletedCount++;
                        this.logger.log(`🗑️ Deleted old file: ${file.path}`);
                    } catch (error) {
                        this.logger.error(`Failed to delete old file ${file.path}:`, error);
                    }
                }
            }

            this.logger.log(`🧹 Cleaned up ${deletedCount} old files`);
            return deletedCount;
        } catch (error) {
            this.logger.error('Failed to cleanup old files:', error);
            throw error;
        }
    }

    /**
     * Get uploads directory path
     */
    getUploadsDirectory(): string {
        return this.uploadsDir;
    }

    /**
     * Get base URL for file serving
     */
    getBaseUrl(): string {
        return this.baseUrl;
    }
}
