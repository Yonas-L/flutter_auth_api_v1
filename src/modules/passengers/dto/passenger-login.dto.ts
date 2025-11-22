import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class PassengerLoginDto {
    @IsString()
    @IsNotEmpty({ message: 'Phone number is required' })
    @Matches(/^(\+251|251|0)?[79]\d{8}$/, {
        message: 'Valid Ethiopian phone number is required (e.g., 0912345678, +251912345678)',
    })
    phoneNumber: string;
}
