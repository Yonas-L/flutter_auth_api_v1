import { IsString, IsOptional, IsIn, IsNumber, Min, Max, IsBoolean, Matches, IsUUID } from 'class-validator';

export class UpdateVehicleDto {
    @IsOptional()
    @IsString()
    @IsUUID()
    class_id?: string;

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    make?: string;

    @IsOptional()
    @IsString()
    model?: string;

    @IsOptional()
    @IsNumber()
    @Min(1970)
    @Max(new Date().getFullYear() + 1)
    year?: number;

    @IsOptional()
    @IsString()
    @Matches(/^[A-Z0-9\-\s]+$/, { message: 'Plate number must contain only letters, numbers, hyphens, and spaces' })
    plate_number?: string;

    @IsOptional()
    @IsString()
    color?: string;

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;

    @IsOptional()
    @IsIn(['pending_review', 'verified', 'rejected'])
    verification_status?: 'pending_review' | 'verified' | 'rejected';

    @IsOptional()
    @IsIn(['manual', 'automatic'])
    transmission?: 'manual' | 'automatic';
}
