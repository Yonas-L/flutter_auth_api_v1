export class UserResponseDto {
    id: string;
    phone_e164?: string;
    email?: string;
    display_name?: string;
    avatar_url?: string;
    is_phone_verified: boolean;
    is_email_verified: boolean;
    status: string;
    created_at: string;
    updated_at: string;
    last_login_at?: string;

    constructor(partial: Partial<UserResponseDto>) {
        Object.assign(this, partial);
    }
}

export class RegistrationProgressDto {
    hasProfile: boolean;
    hasVehicle: boolean;
    isComplete: boolean;
    verificationStatus?: string;
    nextStep: string;

    constructor(partial: Partial<RegistrationProgressDto>) {
        Object.assign(this, partial);
    }
}
