import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';

export interface VehicleType {
    id: number;
    type: string;
    display_name: string;
    description?: string;
    image_url: string;
    base_fare_cents: number;
    price_per_km_cents: number;
    price_per_minute_cents: number;
    seats: number;
    capacity: number;
    category: string;
    features: string[];
    estimated_wait_time_minutes: number;
    is_available: boolean;
    is_active: boolean;
    sort_order: number;
    created_at: Date;
}

@Injectable()
export class VehicleTypesPostgresService {
    private readonly logger = new Logger(VehicleTypesPostgresService.name);

    constructor(private readonly postgresService: PostgresService) { }

    /**
     * Get all active vehicle types
     */
    async findActive(): Promise<VehicleType[]> {
        try {
            const query = `
                SELECT * FROM vehicle_types 
                WHERE is_active = true AND is_available = true 
                ORDER BY sort_order ASC, display_name ASC
            `;
            const result = await this.postgresService.query(query);
            return result.rows;
        } catch (error) {
            this.logger.error('Error finding active vehicle types:', error);
            throw error;
        }
    }

    /**
     * Get vehicle types by category
     */
    async findByCategory(category: string): Promise<VehicleType[]> {
        try {
            const query = `
                SELECT * FROM vehicle_types 
                WHERE category = $1 AND is_active = true AND is_available = true 
                ORDER BY sort_order ASC, display_name ASC
            `;
            const result = await this.postgresService.query(query, [category]);
            return result.rows;
        } catch (error) {
            this.logger.error(`Error finding vehicle types by category ${category}:`, error);
            throw error;
        }
    }

    /**
     * Get vehicle type by ID
     */
    async findById(id: number): Promise<VehicleType | null> {
        try {
            const query = `
                SELECT * FROM vehicle_types 
                WHERE id = $1 AND is_active = true
            `;
            const result = await this.postgresService.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            this.logger.error(`Error finding vehicle type by ID ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get vehicle type by type name
     */
    async findByType(type: string): Promise<VehicleType | null> {
        try {
            const query = `
                SELECT * FROM vehicle_types 
                WHERE type = $1 AND is_active = true
            `;
            const result = await this.postgresService.query(query, [type]);
            return result.rows[0] || null;
        } catch (error) {
            this.logger.error(`Error finding vehicle type by type ${type}:`, error);
            throw error;
        }
    }

    /**
     * Get all categories
     */
    async getCategories(): Promise<string[]> {
        try {
            const query = `
                SELECT DISTINCT category 
                FROM vehicle_types 
                WHERE is_active = true AND is_available = true 
                ORDER BY category ASC
            `;
            const result = await this.postgresService.query(query);
            return result.rows.map(row => row.category);
        } catch (error) {
            this.logger.error('Error getting vehicle type categories:', error);
            throw error;
        }
    }
}
