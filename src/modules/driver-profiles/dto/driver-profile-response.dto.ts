export class DriverProfileResponseDto {
  id: string;
  user_id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  gender?: string;
  phone_number?: string;
  city?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  verification_status: string;
  driver_license_number?: string;
  driver_license_expiry?: string;
  years_of_experience: number;
  rating_avg: number;
  rating_count: number;
  total_trips: number;
  total_earnings_cents: number;
  is_available: boolean;
  is_online: boolean;
  active_vehicle_id?: string;
  created_at: string;
  updated_at: string;

  constructor(partial: Partial<DriverProfileResponseDto>) {
    Object.assign(this, partial);
  }
}

export class DriverRegistrationProgressDto {
  hasProfile: boolean;
  hasVehicle: boolean;
  hasDocuments: boolean;
  isComplete: boolean;
  verificationStatus: string;
  nextStep: string;
  completionPercentage: number;
  missingFields: string[];

  constructor(partial: Partial<DriverRegistrationProgressDto>) {
    Object.assign(this, partial);
  }
}

export class DriverStatsDto {
  totalTrips: number;
  totalEarnings: number; // in cents
  averageRating: number;
  ratingCount: number;
  yearsOfExperience: number;
  isOnline: boolean;
  isAvailable: boolean;
  lastActiveAt?: string;

  constructor(partial: Partial<DriverStatsDto>) {
    Object.assign(this, partial);
  }
}
