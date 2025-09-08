import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from '../postgres.service';
import { BaseRepository } from '../interfaces/base-repository.interface';

@Injectable()
export abstract class BasePostgresRepository<T, CreateData extends Record<string, any> = Partial<T>, UpdateData extends Record<string, any> = Partial<T>> 
    implements BaseRepository<T, CreateData, UpdateData> {
    
    protected readonly logger = new Logger(this.constructor.name);
    protected abstract tableName: string;

    constructor(protected readonly postgresService: PostgresService) {}

    async findById(id: string): Promise<T | null> {
        try {
            const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
            const result = await this.postgresService.query(query, [id]);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return result.rows[0] as T;
        } catch (error) {
            this.logger.error(`Error finding ${this.tableName} by ID ${id}:`, error);
            throw error;
        }
    }

    async findMany(filters?: Partial<T>): Promise<T[]> {
        try {
            let query = `SELECT * FROM ${this.tableName}`;
            const values: any[] = [];
            let paramIndex = 1;

            if (filters && Object.keys(filters).length > 0) {
                const conditions = Object.entries(filters)
                    .filter(([_, value]) => value !== undefined && value !== null)
                    .map(([key, value]) => {
                        values.push(value);
                        return `${key} = $${paramIndex++}`;
                    });

                if (conditions.length > 0) {
                    query += ` WHERE ${conditions.join(' AND ')}`;
                }
            }

            const result = await this.postgresService.query(query, values);
            return result.rows as T[];
        } catch (error) {
            this.logger.error(`Error finding ${this.tableName} with filters:`, error);
            throw error;
        }
    }

    async create(data: CreateData): Promise<T> {
        try {
            const columns = Object.keys(data).join(', ');
            const placeholders = Object.keys(data).map((_, index) => `$${index + 1}`).join(', ');
            const values = Object.values(data);

            const query = `
                INSERT INTO ${this.tableName} (${columns})
                VALUES (${placeholders})
                RETURNING *
            `;

            const result = await this.postgresService.query(query, values);
            return result.rows[0] as T;
        } catch (error) {
            this.logger.error(`Error creating ${this.tableName}:`, error);
            throw error;
        }
    }

    async update(id: string, data: UpdateData): Promise<T | null> {
        try {
            const updateFields = Object.entries(data)
                .filter(([_, value]) => value !== undefined && value !== null)
                .map(([key, _], index) => `${key} = $${index + 2}`)
                .join(', ');

            if (!updateFields) {
                throw new Error('No fields to update');
            }

            const values = [id, ...Object.values(data).filter(value => value !== undefined && value !== null)];
            const query = `
                UPDATE ${this.tableName}
                SET ${updateFields}, updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;

            const result = await this.postgresService.query(query, values);
            
            if (result.rows.length === 0) {
                return null;
            }
            
            return result.rows[0] as T;
        } catch (error) {
            this.logger.error(`Error updating ${this.tableName} with ID ${id}:`, error);
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const query = `DELETE FROM ${this.tableName} WHERE id = $1`;
            const result = await this.postgresService.query(query, [id]);
            
            return result.rowCount > 0;
        } catch (error) {
            this.logger.error(`Error deleting ${this.tableName} with ID ${id}:`, error);
            throw error;
        }
    }

    // Helper method for custom queries
    protected async query(query: string, values: any[] = []): Promise<any> {
        try {
            return await this.postgresService.query(query, values);
        } catch (error) {
            this.logger.error(`Error executing query: ${query}`, error);
            throw error;
        }
    }

    // Helper method for transactions
    protected async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
        try {
            return await this.postgresService.transaction(callback);
        } catch (error) {
            this.logger.error('Error in transaction:', error);
            throw error;
        }
    }
}
