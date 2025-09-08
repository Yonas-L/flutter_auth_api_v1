import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from './postgres.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MigrationService {
    private readonly logger = new Logger(MigrationService.name);
    private readonly migrationsPath = path.join(__dirname, '../../migrations');

    constructor(private readonly postgresService: PostgresService) { }

    /**
     * Run all pending migrations
     */
    async runMigrations(): Promise<void> {
        try {
            this.logger.log('🚀 Starting database migrations...');

            // Create migrations table if it doesn't exist
            await this.createMigrationsTable();

            // Get list of migration files
            const migrationFiles = this.getMigrationFiles();

            // Get already executed migrations
            const executedMigrations = await this.getExecutedMigrations();

            // Run pending migrations
            for (const migrationFile of migrationFiles) {
                if (!executedMigrations.includes(migrationFile)) {
                    await this.runMigration(migrationFile);
                }
            }

            this.logger.log('✅ All database migrations completed successfully');
        } catch (error) {
            this.logger.error('❌ Migration failed:', error);
            throw error;
        }
    }

    /**
     * Create migrations tracking table
     */
    private async createMigrationsTable(): Promise<void> {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS public.migrations (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        `;

        await this.postgresService.query(createTableSQL);
        this.logger.log('✅ Migrations table created/verified');
    }

    /**
     * Get list of migration files
     */
    private getMigrationFiles(): string[] {
        if (!fs.existsSync(this.migrationsPath)) {
            this.logger.warn('Migrations directory does not exist');
            return [];
        }

        return fs.readdirSync(this.migrationsPath)
            .filter(file => file.endsWith('.sql'))
            .sort();
    }

    /**
     * Get list of already executed migrations
     */
    private async getExecutedMigrations(): Promise<string[]> {
        try {
            const result = await this.postgresService.query(
                'SELECT filename FROM public.migrations ORDER BY executed_at'
            );
            return result.rows.map(row => row.filename);
        } catch (error) {
            this.logger.warn('Could not fetch executed migrations:', error);
            return [];
        }
    }

    /**
     * Run a single migration
     */
    private async runMigration(filename: string): Promise<void> {
        try {
            this.logger.log(`📄 Running migration: ${filename}`);

            const migrationPath = path.join(this.migrationsPath, filename);
            const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

            // Execute migration in a transaction
            await this.postgresService.transaction(async (client) => {
                await client.query(migrationSQL);

                // Record migration as executed
                await client.query(
                    'INSERT INTO public.migrations (filename) VALUES ($1)',
                    [filename]
                );
            });

            this.logger.log(`✅ Migration completed: ${filename}`);
        } catch (error) {
            this.logger.error(`❌ Migration failed: ${filename}`, error);
            throw error;
        }
    }

    /**
     * Check if migrations are up to date
     */
    async isUpToDate(): Promise<boolean> {
        try {
            const migrationFiles = this.getMigrationFiles();
            const executedMigrations = await this.getExecutedMigrations();

            return migrationFiles.every(file => executedMigrations.includes(file));
        } catch (error) {
            this.logger.error('Error checking migration status:', error);
            return false;
        }
    }

    /**
     * Get migration status
     */
    async getMigrationStatus(): Promise<any> {
        try {
            const migrationFiles = this.getMigrationFiles();
            const executedMigrations = await this.getExecutedMigrations();

            return {
                total: migrationFiles.length,
                executed: executedMigrations.length,
                pending: migrationFiles.filter(file => !executedMigrations.includes(file)),
                isUpToDate: migrationFiles.every(file => executedMigrations.includes(file))
            };
        } catch (error) {
            this.logger.error('Error getting migration status:', error);
            throw error;
        }
    }
}
