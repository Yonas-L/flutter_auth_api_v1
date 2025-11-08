import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    UseGuards,
    HttpException,
    HttpStatus,
    Logger,
    UseInterceptors,
    UploadedFile,
    Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AdsService } from './ads.service';
import { CloudinaryService } from '../storage/cloudinary.service';
import type { User } from '../database/entities/user.entity';

@Controller('api/ads')
@UseGuards(JwtAuthGuard)
export class AdsController {
    private readonly logger = new Logger(AdsController.name);

    constructor(
        private readonly adsService: AdsService,
        private readonly cloudinaryService: CloudinaryService,
    ) {}

    /**
     * Upload ad image/video to Cloudinary
     * POST /api/ads/upload
     */
    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadAdMedia(
        @CurrentUser() user: User,
        @UploadedFile() file: Express.Multer.File,
    ) {
        try {
            // Check if user is admin
            const userType: any = (user as any)?.user_type ?? (user as any)?.userType;
            if (!['admin', 'super_admin'].includes(userType)) {
                throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
            }

            if (!file) {
                throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
            }

            this.logger.log(`📤 Uploading ad media: ${file.originalname}`);

            // Upload to Cloudinary with /ads/ folder structure
            // Structure: ads/{timestamp}_{filename}
            const timestamp = Date.now();
            const fileName = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
            const publicId = `ads/${timestamp}_${fileName.split('.')[0]}`;
            
            const uploadResult = await this.cloudinaryService.uploadFile(file, {
                folder: 'ads',
                public_id: publicId,
                resource_type: 'auto', // Automatically detect image or video
                quality: 'auto',
            });

            this.logger.log(`✅ Ad media uploaded: ${uploadResult.public_id}`);

            return {
                success: true,
                secure_url: uploadResult.secure_url,
                url: uploadResult.url,
                public_id: uploadResult.public_id,
                width: uploadResult.width,
                height: uploadResult.height,
                format: uploadResult.format,
                resource_type: uploadResult.resource_type,
            };
        } catch (error) {
            this.logger.error(`❌ Error uploading ad media: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to upload ad media',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get all ads
     * GET /api/ads
     */
    @Get()
    async getAds(
        @CurrentUser() user: User,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        try {
            // Check if user is admin
            const userType: any = (user as any)?.user_type ?? (user as any)?.userType;
            if (!['admin', 'super_admin'].includes(userType)) {
                throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
            }

            const pageNum = page ? parseInt(page, 10) : 1;
            const limitNum = limit ? parseInt(limit, 10) : 20;

            return await this.adsService.getAds(pageNum, limitNum);
        } catch (error) {
            this.logger.error(`❌ Error fetching ads: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to fetch ads',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get single ad
     * GET /api/ads/:id
     */
    @Get(':id')
    async getAd(@CurrentUser() user: User, @Param('id') id: string) {
        try {
            // Check if user is admin
            const userType: any = (user as any)?.user_type ?? (user as any)?.userType;
            if (!['admin', 'super_admin'].includes(userType)) {
                throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
            }

            return await this.adsService.getAdById(parseInt(id, 10));
        } catch (error) {
            this.logger.error(`❌ Error fetching ad: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to fetch ad',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Create ad
     * POST /api/ads
     */
    @Post()
    async createAd(@CurrentUser() user: User, @Body() createAdDto: any) {
        try {
            // Check if user is admin
            const userType: any = (user as any)?.user_type ?? (user as any)?.userType;
            if (!['admin', 'super_admin'].includes(userType)) {
                throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
            }

            return await this.adsService.createAd(createAdDto);
        } catch (error) {
            this.logger.error(`❌ Error creating ad: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to create ad',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Update ad
     * PUT /api/ads/:id
     */
    @Put(':id')
    async updateAd(
        @CurrentUser() user: User,
        @Param('id') id: string,
        @Body() updateAdDto: any,
    ) {
        try {
            // Check if user is admin
            const userType: any = (user as any)?.user_type ?? (user as any)?.userType;
            if (!['admin', 'super_admin'].includes(userType)) {
                throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
            }

            return await this.adsService.updateAd(parseInt(id, 10), updateAdDto);
        } catch (error) {
            this.logger.error(`❌ Error updating ad: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to update ad',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Delete ad
     * DELETE /api/ads/:id
     */
    @Delete(':id')
    async deleteAd(@CurrentUser() user: User, @Param('id') id: string) {
        try {
            // Check if user is admin
            const userType: any = (user as any)?.user_type ?? (user as any)?.userType;
            if (!['admin', 'super_admin'].includes(userType)) {
                throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
            }

            return await this.adsService.deleteAd(parseInt(id, 10));
        } catch (error) {
            this.logger.error(`❌ Error deleting ad: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Failed to delete ad',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}

