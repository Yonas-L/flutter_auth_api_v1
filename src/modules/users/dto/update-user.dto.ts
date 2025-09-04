import { IsEmail, IsOptional, IsString, IsBoolean, IsIn, Matches } from 'class-validator';

export class UpdateUserDto {
    @IsOptional()
    @Matches(/^\+251[79]\d{8}$/, { message: 'Phone number must be in Ethiopian E164 format (+251...)' })
    phone_e164?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    display_name?: string;

    @IsOptional()
    @IsString()
    avatar_url?: string;

    @IsOptional()
    @IsBoolean()
    is_phone_verified?: boolean;

    @IsOptional()
    @IsBoolean()
    is_email_verified?: boolean;

    @IsOptional()
    @IsIn(['pending_verification', 'verified', 'active', 'suspended', 'deleted'])
    status?: 'pending_verification' | 'verified' | 'active' | 'suspended' | 'deleted';
}
