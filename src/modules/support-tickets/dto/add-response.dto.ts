import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class AddResponseDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(5000)
    message: string;
}

