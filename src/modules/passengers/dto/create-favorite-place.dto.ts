import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateFavoritePlaceDto {
    @IsString()
    @IsNotEmpty({ message: 'Label is required' })
    label: string;

    @IsString()
    @IsNotEmpty({ message: 'Address is required' })
    address: string;

    @IsNumber()
    @IsNotEmpty({ message: 'Latitude is required' })
    latitude: number;

    @IsNumber()
    @IsNotEmpty({ message: 'Longitude is required' })
    longitude: number;

    @IsString()
    @IsOptional()
    icon?: string;
}
