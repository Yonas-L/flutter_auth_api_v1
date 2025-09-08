export interface Trip {
    id: string;
    passenger_id: string;
    passenger_profile_id?: string;
    driver_id?: string;
    vehicle_id?: string;
    vehicle_type_id?: number;
    status: 'requested' | 'accepted' | 'in_progress' | 'completed' | 'canceled' | 'no_show';
    pickup_address?: string;
    pickup_latitude?: number;
    pickup_longitude?: number;
    pickup_point?: string; // PostGIS point as string
    dropoff_address?: string;
    dropoff_latitude?: number;
    dropoff_longitude?: number;
    dropoff_point?: string; // PostGIS point as string
    estimated_distance_km?: number;
    estimated_duration_minutes?: number;
    estimated_fare_cents?: number;
    final_fare_cents?: number;
    actual_distance_km?: number;
    actual_duration_minutes?: number;
    trip_type: 'standard' | 'scheduled' | 'shared';
    passenger_count: number;
    special_instructions?: string;
    payment_method: 'cash' | 'wallet' | 'card';
    payment_status: 'pending' | 'completed' | 'failed' | 'refunded';
    driver_earnings_cents?: number;
    commission_cents?: number;
    canceled_by_user_id?: string;
    // Passenger Backend Integration Features
    trip_reference?: string;
    driver_details?: string; // JSON string
    selected_vehicle_details?: string; // JSON string
    trip_notes?: string;
    special_requirements?: string;
    estimated_wait_time_minutes: number;
    actual_wait_time_minutes?: number;
    surge_multiplier: number;
    discount_cents: number;
    tip_cents: number;
    platform_fee_cents: number;
    cancellation_fee_cents: number;
    // Timestamps
    request_timestamp?: string;
    accepted_at?: string;
    driver_assigned_at?: string;
    driver_arrived_at?: string;
    started_at?: string;
    trip_started_at?: string;
    completed_at?: string;
    trip_completed_at?: string;
    canceled_at?: string;
    cancel_reason?: string;
    // Ratings and Comments
    passenger_rating?: number;
    driver_rating?: number;
    passenger_comment?: string;
    driver_comment?: string;
    created_at: string;
    updated_at: string;
}

export interface CreateTripData {
    passenger_id: string;
    passenger_profile_id?: string;
    driver_id?: string;
    vehicle_id?: string;
    vehicle_type_id?: number;
    status?: Trip['status'];
    pickup_address?: string;
    pickup_latitude?: number;
    pickup_longitude?: number;
    dropoff_address?: string;
    dropoff_latitude?: number;
    dropoff_longitude?: number;
    estimated_distance_km?: number;
    estimated_duration_minutes?: number;
    estimated_fare_cents?: number;
    trip_type?: Trip['trip_type'];
    passenger_count?: number;
    special_instructions?: string;
    payment_method?: Trip['payment_method'];
    payment_status?: Trip['payment_status'];
    // Passenger Backend Integration Features
    trip_reference?: string;
    driver_details?: string; // JSON string
    selected_vehicle_details?: string; // JSON string
    trip_notes?: string;
    special_requirements?: string;
    estimated_wait_time_minutes?: number;
    surge_multiplier?: number;
    discount_cents?: number;
    tip_cents?: number;
    platform_fee_cents?: number;
    cancellation_fee_cents?: number;
    request_timestamp?: string;
}

export interface UpdateTripData {
    driver_id?: string;
    vehicle_id?: string;
    vehicle_type_id?: number;
    status?: Trip['status'];
    pickup_address?: string;
    pickup_latitude?: number;
    pickup_longitude?: number;
    dropoff_address?: string;
    dropoff_latitude?: number;
    dropoff_longitude?: number;
    estimated_distance_km?: number;
    estimated_duration_minutes?: number;
    estimated_fare_cents?: number;
    final_fare_cents?: number;
    actual_distance_km?: number;
    actual_duration_minutes?: number;
    trip_type?: Trip['trip_type'];
    passenger_count?: number;
    special_instructions?: string;
    payment_method?: Trip['payment_method'];
    payment_status?: Trip['payment_status'];
    driver_earnings_cents?: number;
    commission_cents?: number;
    canceled_by_user_id?: string;
    // Passenger Backend Integration Features
    driver_details?: string; // JSON string
    selected_vehicle_details?: string; // JSON string
    trip_notes?: string;
    special_requirements?: string;
    estimated_wait_time_minutes?: number;
    actual_wait_time_minutes?: number;
    surge_multiplier?: number;
    discount_cents?: number;
    tip_cents?: number;
    platform_fee_cents?: number;
    cancellation_fee_cents?: number;
    // Timestamps
    accepted_at?: string;
    driver_assigned_at?: string;
    driver_arrived_at?: string;
    started_at?: string;
    trip_started_at?: string;
    completed_at?: string;
    trip_completed_at?: string;
    canceled_at?: string;
    cancel_reason?: string;
    // Ratings and Comments
    passenger_rating?: number;
    driver_rating?: number;
    passenger_comment?: string;
    driver_comment?: string;
}
