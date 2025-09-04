import { IsString, IsOptional, IsIn, IsNumber, Min, IsUUID } from 'class-validator';

export class CreateDocumentDto {
    @IsString()
    @IsUUID()
    user_id: string;

    @IsIn(['driver_license', 'vehicle_registration', 'insurance', 'profile_picture', 'vehicle_photo', 'other'])
    doc_type: 'driver_license' | 'vehicle_registration' | 'insurance' | 'profile_picture' | 'vehicle_photo' | 'other';

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
