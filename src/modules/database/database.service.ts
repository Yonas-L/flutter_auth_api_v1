import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class DatabaseService implements OnModuleInit {
    private readonly logger = new Logger(DatabaseService.name);
    private supabaseClient: SupabaseClient;

    constructor(private configService: ConfigService) { }

    async onModuleInit() {
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
        }

        this.supabaseClient = createClient(supabaseUrl as string, supabaseServiceKey as string, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            }
        });

        this.logger.log('✅ Supabase client initialized successfully');

        // Test connection asynchronously to avoid blocking startup
        this.testConnection().catch((error) => {
            this.logger.warn('⚠️ Supabase connection test failed during startup:', (error as any)?.message ?? error);
            this.logger.warn('   The service will continue but Supabase-dependent operations may fail');
        });
    }

    get client(): SupabaseClient {
        if (!this.supabaseClient) {
            throw new Error('Supabase client not initialized');
        }
        return this.supabaseClient;
    }

    private async testConnection(): Promise<void> {
        try {
            // Test with a simple query to the users table
            const { error } = await this.supabaseClient
                .from('users')
                .select('count', { count: 'exact', head: true });

            if (error) {
                this.logger.error('❌ Database connection test failed:', error.message);
                throw error;
            }

            this.logger.log('✅ Database connection successful. Users table accessible.');
        } catch (error) {
            this.logger.error('❌ Failed to test database connection:', error);
            throw error;
        }
    }

    /**
     * Execute a raw SQL query (for complex operations)
     */
    async executeRpc(functionName: string, params?: any): Promise<any> {
        const { data, error } = await this.supabaseClient.rpc(functionName, params);

        if (error) {
            this.logger.error(`RPC ${functionName} failed:`, error);
            throw error;
        }

        return data;
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
}
