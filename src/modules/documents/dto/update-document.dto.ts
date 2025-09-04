import { IsString, IsOptional, IsIn, IsUUID } from 'class-validator';

export class UpdateDocumentDto {
    @IsOptional()
    @IsString()
    file_path?: string;

    @IsOptional()
    @IsString()
    file_name?: string;

    @IsOptional()
    @IsString()
    mime_type?: string;

    @IsOptional()
    @IsString()
    public_url?: string;

    @IsOptional()
    @IsIn(['pending_review', 'verified', 'rejected'])
    verification_status?: 'pending_review' | 'verified' | 'rejected';

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsString()
    @IsUUID()
    reviewer_user_id?: string;

    @IsOptional()
    @IsString()
    reviewed_at?: string;
}
