import { IsString, IsNotEmpty, IsOptional, MaxLength, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AttachmentDto } from './attachment.dto';

export class AddResponseDto {
    @IsString()
    @IsOptional()
    @MaxLength(5000)
    message?: string;

    @IsArray()
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => AttachmentDto)
    attachments?: AttachmentDto[];
}

