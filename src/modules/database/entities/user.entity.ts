export interface User {
    id: string;
    phone_number?: string; // Match actual database schema
    email?: string;
    full_name?: string; // Match actual database schema (unified schema uses full_name)
    display_name?: string; // Keep for backward compatibility
    avatar_url?: string;
    user_type: 'passenger' | 'driver' | 'admin';
    is_phone_verified: boolean;
    is_email_verified: boolean;
    is_active: boolean;
    // Passenger Backend Integration Features
    otp?: string;
    otp_expires_at?: string;
    preferred_language?: string;
    notification_preferences?: 'all' | 'trips_only' | 'none';
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    date_of_birth?: string;
    gender?: 'male' | 'female' | 'other';
    created_at: string;
    updated_at: string;
    last_login_at?: string;
    deleted_at?: string;
}

export interface CreateUserData {
    id?: string; // Auth user ID
    phone_number?: string; // Match actual database schema
    email?: string;
    full_name?: string; // Match actual database schema (unified schema uses full_name)
    display_name?: string; // Keep for backward compatibility
    avatar_url?: string;
    user_type?: User['user_type'];
    is_phone_verified?: boolean;
    is_email_verified?: boolean;
    is_active?: boolean;
    // Passenger Backend Integration Features
    otp?: string;
    otp_expires_at?: string;
    preferred_language?: string;
    notification_preferences?: User['notification_preferences'];
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    date_of_birth?: string;
    gender?: User['gender'];
}

export interface UpdateUserData {
    phone_number?: string; // Match actual database schema
    email?: string;
    full_name?: string; // Match actual database schema (unified schema uses full_name)
    display_name?: string; // Keep for backward compatibility
    avatar_url?: string;
    user_type?: User['user_type'];
    is_phone_verified?: boolean;
    is_email_verified?: boolean;
    is_active?: boolean;
    last_login_at?: string;
    // Passenger Backend Integration Features
    otp?: string;
    otp_expires_at?: string;
    preferred_language?: string;
    notification_preferences?: User['notification_preferences'];
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    date_of_birth?: string;
    gender?: User['gender'];
}
