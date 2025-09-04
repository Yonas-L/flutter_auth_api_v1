import { IsString, IsOptional, IsIn, IsUUID } from 'class-validator';

export class FileUploadDto {
    @IsString()
    @IsUUID()
    user_id: string;

    @IsIn(['driver_license', 'vehicle_registration', 'insurance', 'profile_picture', 'vehicle_photo', 'other'])
    doc_type: 'driver_license' | 'vehicle_registration' | 'insurance' | 'profile_picture' | 'vehicle_photo' | 'other';

    @IsOptional()
    @IsString()
    notes?: string;
}

export class BulkFileUploadDto {
    @IsString()
    @IsUUID()
    user_id: string;

    files: Array<{
        doc_type: 'driver_license' | 'vehicle_registration' | 'insurance' | 'profile_picture' | 'vehicle_photo' | 'other';
        notes?: string;
    }>;
}

export class DocumentVerifyDto {
    @IsIn(['verified', 'rejected'])
    verification_status: 'verified' | 'rejected';

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsString()
    @IsUUID()
    reviewer_user_id?: string;
}
