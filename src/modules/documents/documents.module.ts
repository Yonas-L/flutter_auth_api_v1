import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DatabaseModule } from '../database/database.module';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Module({
    imports: [
        DatabaseModule,
        MulterModule.registerAsync({
            useFactory: () => {
                return {
                    storage: diskStorage({
                        destination: '/tmp', // Use temp directory since we upload to Supabase
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
    controllers: [DocumentsController],
    providers: [DocumentsService],
    exports: [DocumentsService],
})
export class DocumentsModule { }