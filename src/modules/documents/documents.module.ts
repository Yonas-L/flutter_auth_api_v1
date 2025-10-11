import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsPostgresController } from './documents-postgres.controller';
import { DocumentsCloudinaryController } from './documents-cloudinary.controller';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { CloudinaryModule } from '../storage/cloudinary.module';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Module({
    imports: [
        DatabaseModule,
        StorageModule,
        CloudinaryModule,
        MulterModule.registerAsync({
            useFactory: () => {
                return {
                    storage: diskStorage({
                        destination: '/tmp', // Use temp directory for file uploads
                        filename: (req, file, cb) => {
                            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                            const extension = extname(file.originalname);
                            cb(null, `${file.fieldname}-${uniqueSuffix}${extension}`);
                        },
                    }),
                    limits: {
                        fileSize: 10 * 1024 * 1024, // 10MB
                    },
                    fileFilter: (req, file, cb) => {
                        const allowedTypes = [
                            'image/jpeg',
                            'image/jpg',
                            'image/png',
                            'image/webp',
                            'application/pdf',
                        ];

                        if (allowedTypes.includes(file.mimetype)) {
                            cb(null, true);
                        } else {
                            cb(new Error(`File type ${file.mimetype} is not allowed`), false);
                        }
                    },
                };
            },
        }),
    ],
    controllers: [DocumentsPostgresController, DocumentsCloudinaryController],
    providers: [DocumentsService],
    exports: [DocumentsService],
})
export class DocumentsModule { }