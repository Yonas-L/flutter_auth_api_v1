import { IsString, IsNotEmpty, Length } from 'class-validator';

export class VerifyOtpDto {
    @IsString()
    @IsNotEmpty({ message: 'Phone number is required' })
    phoneNumber: string;

    @IsString()
    @IsNotEmpty({ message: 'OTP is required' })
    @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
    otp: string;
}
