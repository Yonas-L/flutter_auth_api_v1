import {
    Controller,
    Get,
    Param,
    Query,
    Res,
    HttpException,
    HttpStatus,
    Logger,
    UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { LocalStorageService } from './local-storage.service';
import * as path from 'path';

@Controller('api/files')
export class FileServeController {
    private readonly logger = new Logger(FileServeController.name);

    constructor(private readonly localStorageService: LocalStorageService) { }

    /**
     * Serve file by path
     */
    @Get(':userId/:subfolder/:fileName')
    async serveFile(
        @Param('userId') userId: string,
        @Param('subfolder') subfolder: string,
        @Param('fileName') fileName: string,
        @Res() res: Response,
    ) {
        try {
            // Construct file path
            const filePath = path.join(
                this.localStorageService.getUploadsDirectory(),
                userId,
                subfolder,
                fileName
            );

            // Check if file exists
            const fileInfo = await this.localStorageService.getFileInfo(filePath);
            if (!fileInfo.exists) {
                throw new HttpException('File not found', HttpStatus.NOT_FOUND);
            }

            // Set appropriate headers
            res.setHeader('Content-Type', fileInfo.mimeType || 'application/octet-stream');
            res.setHeader('Content-Length', fileInfo.size || 0);
            res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
            res.setHeader('Last-Modified', fileInfo.lastModified?.toUTCString() || new Date().toUTCString());

            // Read and send file
            const fileBuffer = await this.localStorageService.readFile(filePath);
            if (!fileBuffer) {
                throw new HttpException('Failed to read file', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            res.send(fileBuffer);
        } catch (error) {
            this.logger.error(`Error serving file ${fileName}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get file info (protected endpoint)
     */
    @Get('info/:userId/:subfolder/:fileName')
    @UseGuards(AuthGuard('jwt-postgres'))
    async getFileInfo(
        @Param('userId') userId: string,
        @Param('subfolder') subfolder: string,
        @Param('fileName') fileName: string,
    ) {
        try {
            const filePath = path.join(
                this.localStorageService.getUploadsDirectory(),
                userId,
                subfolder,
                fileName
            );

            const fileInfo = await this.localStorageService.getFileInfo(filePath);
            if (!fileInfo.exists) {
                throw new HttpException('File not found', HttpStatus.NOT_FOUND);
            }

            return {
                fileName,
                filePath,
                size: fileInfo.size,
                mimeType: fileInfo.mimeType,
                lastModified: fileInfo.lastModified,
                publicUrl: `${this.localStorageService.getBaseUrl()}/api/files/${userId}/${subfolder}/${fileName}`,
            };
        } catch (error) {
            this.logger.error(`Error getting file info for ${fileName}:`, error);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get storage statistics (protected endpoint)
     */
    @Get('stats')
    @UseGuards(AuthGuard('jwt-postgres'))
    async getStorageStats(@Query('userId') userId?: string) {
        try {
            return await this.localStorageService.getStorageStats(userId);
        } catch (error) {
            this.logger.error('Error getting storage stats:', error);
            throw new HttpException('Failed to get storage stats', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
