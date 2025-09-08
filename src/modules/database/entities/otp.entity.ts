export interface OtpCode {
    id: string;
    phone_number: string;
    code_hash: string;
    purpose: 'registration' | 'login' | 'password_reset' | 'phone_change' | 'phone_verification';
    expires_at: string;
    attempts: number;
    max_attempts: number;
    is_used: boolean;
    used_at?: string;
    device_id?: string;
    ip_address?: string;
    verification_id?: string;
    message_id?: string;
    created_at: string;
}

export interface CreateOtpCodeData {
    phone_number: string;
    code_hash: string;
    purpose?: OtpCode['purpose'];
    expires_at: string;
    max_attempts?: number;
    device_id?: string;
    ip_address?: string;
    verification_id?: string;
    message_id?: string;
}

export interface UpdateOtpCodeData {
    attempts?: number;
    is_used?: boolean;
    used_at?: string;
}
