import { IsString, IsOptional, IsEmail } from 'class-validator';

export class UpdatePassengerProfileDto {
    @IsString()
    @IsOptional()
    full_name?: string;

    @IsEmail({}, { message: 'Invalid email address' })
    @IsOptional()
    email?: string;

    @IsString()
    @IsOptional()
    avatar_url?: string;
}
