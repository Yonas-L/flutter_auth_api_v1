import { IsString, IsOptional, IsIn, IsNumber, Min, IsUUID } from 'class-validator';

export class CreateDocumentDto {
    @IsString()
    @IsUUID()
    user_id: string;

    @IsString()
    doc_type: string;

    @IsString()
    file_path: string;

    @IsString()
    file_name: string;

    @IsNumber()
    @Min(1)
    file_size_bytes: number;

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
}
