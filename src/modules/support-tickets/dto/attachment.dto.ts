import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

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

