import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AttachmentDto {
    @IsString()
    @IsNotEmpty()
    url: string;

    @IsString()
    @IsNotEmpty()
    filename: string;

    @IsString()
    @IsNotEmpty()
    type: string; // 'image' or 'document'

    @IsOptional()
    size?: number; // File size in bytes
}

export class CreateTicketDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    subject: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(5000)
    message: string;

    @IsString()
    @IsOptional()
    @IsIn(['general', 'trip', 'payment', 'technical', 'account'])
    category?: string;

    @IsString()
    @IsOptional()
    @IsIn(['low', 'normal', 'high', 'urgent'])
    priority?: string;

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => AttachmentDto)
    attachments?: AttachmentDto[];
}

