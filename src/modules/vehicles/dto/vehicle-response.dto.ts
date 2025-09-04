export class VehicleResponseDto {
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
    verification_status: string;
    transmission?: string;
    created_at: string;
    updated_at: string;

    // Vehicle class information (if included)
    vehicle_class?: {
        id: string;
        name: string;
        description?: string;
        category: string;
        seats: number;
        base_fare_cents: number;
        per_km_cents: number;
        per_minute_cents: number;
    };

    constructor(partial: Partial<VehicleResponseDto>) {
        Object.assign(this, partial);
    }
}

export class VehicleClassResponseDto {
    id: string;
    name: string;
    description?: string;
    base_fare_cents: number;
    per_km_cents: number;
    per_minute_cents: number;
    seats: number;
    category: string;
    is_active: boolean;
    created_at: string;

    constructor(partial: Partial<VehicleClassResponseDto>) {
        Object.assign(this, partial);
    }
}

export class VehicleStatsDto {
    totalVehicles: number;
    activeVehicles: number;
    verifiedVehicles: number;
    pendingVerification: number;
    rejectedVehicles: number;
    vehiclesByCategory: Record<string, number>;
    vehiclesByMake: Record<string, number>;
    averageYear: number;
    oldestYear: number;
    newestYear: number;

    constructor(partial: Partial<VehicleStatsDto>) {
        Object.assign(this, partial);
    }
}

export class DriverVehiclesSummaryDto {
    driverId: string;
    totalVehicles: number;
    activeVehicles: number;
    primaryVehicle?: VehicleResponseDto;
    vehicles: VehicleResponseDto[];

    constructor(partial: Partial<DriverVehiclesSummaryDto>) {
        Object.assign(this, partial);
    }
}
