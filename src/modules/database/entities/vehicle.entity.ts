export interface Vehicle {
    id: string;
    driver_id: string;
    class_id: string;
    name?: string;
    make: string;
    model: string;
    year: number;
    plate_number: string;
    color?: string;
    is_active: boolean;
    verification_status: 'pending_review' | 'verified' | 'rejected';
    transmission?: 'manual' | 'automatic';
    created_at: string;
    updated_at: string;
}

export interface CreateVehicleData {
    driver_id: string;
    class_id: string;
    name?: string;
    make: string;
    model: string;
    year: number;
    plate_number: string;
    color?: string;
    is_active?: boolean;
    verification_status?: Vehicle['verification_status'];
    transmission?: Vehicle['transmission'];
}

export interface UpdateVehicleData {
    class_id?: string;
    name?: string;
    make?: string;
    model?: string;
    year?: number;
    plate_number?: string;
    color?: string;
    is_active?: boolean;
    verification_status?: Vehicle['verification_status'];
    transmission?: Vehicle['transmission'];
}
