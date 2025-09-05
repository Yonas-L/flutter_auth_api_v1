export interface DriverProfile {
    id: string;
    user_id: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    gender?: 'male' | 'female' | 'other' | 'Male' | 'Female' | 'Other';
    phone_number?: string;
    city?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    verification_status: 'unverified' | 'pending_review' | 'verified' | 'rejected';
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
    // Real-time tracking fields
    last_known_location?: string; // PostGIS geography as string
    last_location_update?: string;
    current_trip_id?: string;
    socket_id?: string;
    created_at: string;
    updated_at: string;
}

export interface CreateDriverProfileData {
    user_id: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    gender?: DriverProfile['gender'];
    phone_number?: string;
    city?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    verification_status?: DriverProfile['verification_status'];
    driver_license_number?: string;
    driver_license_expiry?: string;
    years_of_experience?: number;
}

export interface UpdateDriverProfileData {
    full_name?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
    gender?: DriverProfile['gender'];
    phone_number?: string;
    city?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    verification_status?: DriverProfile['verification_status'];
    driver_license_number?: string;
    driver_license_expiry?: string;
    years_of_experience?: number;
    rating_avg?: number;
    rating_count?: number;
    total_trips?: number;
    total_earnings_cents?: number;
    is_available?: boolean;
    is_online?: boolean;
    active_vehicle_id?: string;
}
