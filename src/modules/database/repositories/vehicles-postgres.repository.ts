import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from '../postgres.service';

export interface Vehicle {
  id: string;
  driver_id: string;
  class_id: number;
  make: string;
  model: string;
  year: number;
  color: string;
  license_plate: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateVehicleData {
  driver_id: string;
  class_id: number;
  make: string;
  model: string;
  year: number;
  color: string;
  license_plate: string;
  is_active?: boolean;
}

export interface UpdateVehicleData {
  class_id?: number;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  license_plate?: string;
  is_active?: boolean;
}

@Injectable()
export class VehiclesPostgresRepository {
  private readonly logger = new Logger(VehiclesPostgresRepository.name);

  constructor(private readonly postgresService: PostgresService) {}

  async findById(id: string): Promise<Vehicle | null> {
    try {
      const query = 'SELECT * FROM vehicles WHERE id = $1';
      const result = await this.postgresService.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToVehicle(result.rows[0]);
    } catch (error) {
      this.logger.error(`Error finding vehicle by id ${id}:`, error);
      throw error;
    }
  }

  async findMany(filters: Partial<Vehicle> = {}): Promise<Vehicle[]> {
    try {
      let query = 'SELECT * FROM vehicles WHERE 1=1';
      const values: any[] = [];
      let paramCount = 0;

      if (filters.driver_id) {
        paramCount++;
        query += ` AND driver_id = $${paramCount}`;
        values.push(filters.driver_id);
      }

      if (filters.class_id) {
        paramCount++;
        query += ` AND class_id = $${paramCount}`;
        values.push(filters.class_id);
      }

      if (filters.is_active !== undefined) {
        paramCount++;
        query += ` AND is_active = $${paramCount}`;
        values.push(filters.is_active);
      }

      query += ' ORDER BY created_at DESC';

      const result = await this.postgresService.query(query, values);
      return result.rows.map(row => this.mapRowToVehicle(row));
    } catch (error) {
      this.logger.error('Error finding vehicles:', error);
      throw error;
    }
  }

  async create(data: CreateVehicleData): Promise<Vehicle> {
    try {
      const query = `
        INSERT INTO vehicles (
          driver_id, class_id, make, model, year, color, license_plate, is_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        ) RETURNING *
      `;

      const values = [
        data.driver_id,
        data.class_id,
        data.make,
        data.model,
        data.year,
        data.color,
        data.license_plate,
        data.is_active !== undefined ? data.is_active : true
      ];

      const result = await this.postgresService.query(query, values);
      return this.mapRowToVehicle(result.rows[0]);
    } catch (error) {
      this.logger.error('Error creating vehicle:', error);
      throw error;
    }
  }

  async update(id: string, data: UpdateVehicleData): Promise<Vehicle | null> {
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let paramCount = 0;

      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) {
          paramCount++;
          fields.push(`${key} = $${paramCount}`);
          values.push(value);
        }
      });

      if (fields.length === 0) {
        return this.findById(id);
      }

      paramCount++;
      fields.push(`updated_at = NOW()`);
      values.push(id);

      const query = `
        UPDATE vehicles 
        SET ${fields.join(', ')} 
        WHERE id = $${paramCount} 
        RETURNING *
      `;

      const result = await this.postgresService.query(query, values);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToVehicle(result.rows[0]);
    } catch (error) {
      this.logger.error(`Error updating vehicle ${id}:`, error);
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const query = 'DELETE FROM vehicles WHERE id = $1';
      const result = await this.postgresService.query(query, [id]);
      return result.rowCount > 0;
    } catch (error) {
      this.logger.error(`Error deleting vehicle ${id}:`, error);
      throw error;
    }
  }

  private mapRowToVehicle(row: any): Vehicle {
    return {
      id: row.id,
      driver_id: row.driver_id,
      class_id: row.class_id,
      make: row.make,
      model: row.model,
      year: row.year,
      color: row.color,
      license_plate: row.license_plate,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
