import { IsString, IsNotEmpty, IsOptional, MaxLength, IsArray, ValidateNested } from 'class-validator';
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

export class AddResponseDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(5000)
    message: string;

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => AttachmentDto)
    attachments?: AttachmentDto[];
}

