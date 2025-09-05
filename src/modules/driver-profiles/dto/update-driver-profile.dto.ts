import { IsString, IsOptional, IsDateString, IsIn, IsNumber, Min, Max, IsBoolean, Matches } from 'class-validator';

export class UpdateDriverProfileDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @IsOptional()
  @IsIn(['male', 'female', 'other', 'Male', 'Female', 'Other'])
  gender?: 'male' | 'female' | 'other' | 'Male' | 'Female' | 'Other';

  @IsOptional()
  @Matches(/^\+251[79]\d{8}$/, { message: 'Phone number must be in Ethiopian E164 format (+251...)' })
  phone_number?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  emergency_contact_name?: string;

  @IsOptional()
  @Matches(/^\+251[79]\d{8}$/, { message: 'Emergency contact phone must be in Ethiopian E164 format (+251...)' })
  emergency_contact_phone?: string;

  @IsOptional()
  @IsIn(['unverified', 'pending_review', 'verified', 'rejected'])
  verification_status?: 'unverified' | 'pending_review' | 'verified' | 'rejected';

  @IsOptional()
  @IsString()
  driver_license_number?: string;

  @IsOptional()
  @IsDateString()
  driver_license_expiry?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  years_of_experience?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  rating_avg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rating_count?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total_trips?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  total_earnings_cents?: number;

  @IsOptional()
  @IsBoolean()
  is_available?: boolean;

  @IsOptional()
  @IsBoolean()
  is_online?: boolean;

  @IsOptional()
  @IsString()
  active_vehicle_id?: string;

  // Real-time tracking fields
  @IsOptional()
  @IsString()
  last_known_location?: string;

  @IsOptional()
  @IsString()
  last_location_update?: string;

  @IsOptional()
  @IsString()
  current_trip_id?: string;

  @IsOptional()
  @IsString()
  socket_id?: string;
}
