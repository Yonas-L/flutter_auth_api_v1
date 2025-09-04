import { IsString, IsOptional, IsNumber, Min, IsBoolean, IsIn } from 'class-validator';

export class CreateVehicleClassDto {
    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsNumber()
    @Min(0)
    base_fare_cents: number;

    @IsNumber()
    @Min(0)
    per_km_cents: number;

    @IsNumber()
    @Min(0)
    per_minute_cents: number;

    @IsNumber()
    @Min(1)
    seats: number;

    @IsIn(['standard', 'premium', 'luxury', 'suv', 'motorcycle'])
    category: 'standard' | 'premium' | 'luxury' | 'suv' | 'motorcycle';

    @IsOptional()
    @IsBoolean()
    is_active?: boolean;
}
