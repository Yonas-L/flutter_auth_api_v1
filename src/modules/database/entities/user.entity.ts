export interface User {
    id: string;
    phone_e164?: string;
    email?: string;
    display_name?: string;
    avatar_url?: string;
    is_phone_verified: boolean;
    is_email_verified: boolean;
    status: 'pending_verification' | 'verified' | 'active' | 'suspended' | 'deleted';
    created_at: string;
    updated_at: string;
    last_login_at?: string;
    deleted_at?: string;
}

export interface CreateUserData {
    id?: string; // Auth user ID
    phone_e164?: string;
    email?: string;
    display_name?: string;
    avatar_url?: string;
    is_phone_verified?: boolean;
    is_email_verified?: boolean;
    status?: User['status'];
}

export interface UpdateUserData {
    phone_e164?: string;
    email?: string;
    display_name?: string;
    avatar_url?: string;
    is_phone_verified?: boolean;
    is_email_verified?: boolean;
    status?: User['status'];
    last_login_at?: string;
}
