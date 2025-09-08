import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class PostgresService implements OnModuleInit {
    private readonly logger = new Logger(PostgresService.name);
    private pool: Pool;

    constructor(private configService: ConfigService) { }

    async onModuleInit() {
        const connectionString = this.configService.get<string>('DATABASE_URL');

        if (!connectionString) {
            throw new Error('DATABASE_URL must be configured');
        }

        this.pool = new Pool({
            connectionString,
            ssl: {
                rejectUnauthorized: false // Required for Render PostgreSQL
            },
            max: 20, // Maximum number of clients in the pool
            idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
            connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established

        });

        this.logger.log('✅ PostgreSQL pool initialized successfully');

        // Test connection asynchronously to avoid blocking startup
        this.testConnection().catch(error => {
            this.logger.warn('⚠️ PostgreSQL connection test failed during startup:', error.message);
            this.logger.warn('   The service will continue but database operations may fail');
        });
    }

    /**
     * Get a client from the pool
     */
    async getClient(): Promise<PoolClient> {
        return await this.pool.connect();
    }

    /**
     * Execute a query with parameters
     */
    async query(text: string, params?: any[]): Promise<any> {
        const client = await this.getClient();
        try {
            const result = await client.query(text, params);
            return result;
        } finally {
            client.release();
        }
    }

    /**
     * Execute a transaction
     */
    async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Test the database connection
     */
    private async testConnection(): Promise<void> {
        try {
            const result = await this.query('SELECT NOW() as current_time, version() as postgres_version');
            this.logger.log(`✅ PostgreSQL connection successful`);
            this.logger.log(`   Current time: ${result.rows[0].current_time}`);
            this.logger.log(`   PostgreSQL version: ${result.rows[0].postgres_version}`);
        } catch (error) {
            this.logger.error('❌ PostgreSQL connection failed:', error);
            throw error;
        }
    }

    /**
     * Health check for the database connection
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.testConnection();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get database statistics
     */
    async getDatabaseStats(): Promise<any> {
        try {
            const result = await this.query(`
                SELECT 
                    schemaname,
                    tablename,
                    attname,
                    n_distinct,
                    correlation
                FROM pg_stats 
                WHERE schemaname = 'public'
                LIMIT 10
            `);
            return result.rows;
        } catch (error) {
            this.logger.error('Error getting database stats:', error);
            throw error;
        }
    }

    /**
     * Close the connection pool
     */
    async close(): Promise<void> {
        await this.pool.end();
    }
}
