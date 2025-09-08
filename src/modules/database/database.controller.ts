import { Controller, Get, Post } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { PostgresService } from './postgres.service';
import { MigrationService } from './migration.service';
import { TestPostgresRepositoriesService } from './test-postgres-repositories.service';

@Controller('health')
export class DatabaseController {
    constructor(
        private readonly databaseService: DatabaseService, // Legacy Supabase service
        private readonly postgresService: PostgresService, // New PostgreSQL service
        private readonly migrationService: MigrationService, // Migration service
        private readonly testRepositoriesService: TestPostgresRepositoriesService, // Test service
    ) { }

    @Get('database')
    async checkDatabaseHealth() {
        try {
            // Check both Supabase and PostgreSQL connections
            const [supabaseHealthy, postgresHealthy] = await Promise.all([
                this.databaseService.healthCheck().catch(() => false),
                this.postgresService.healthCheck().catch(() => false)
            ]);

            const migrationStatus = await this.migrationService.getMigrationStatus().catch(() => null);

            return {
                status: postgresHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                services: {
                    supabase: supabaseHealthy ? 'healthy' : 'unhealthy',
                    postgresql: postgresHealthy ? 'healthy' : 'unhealthy',
                },
                migrations: migrationStatus,
                primaryDatabase: 'postgresql'
            };
        } catch (error) {
            return {
                status: 'error',
                timestamp: new Date().toISOString(),
                services: {
                    supabase: 'error',
                    postgresql: 'error',
                },
                error: error.message,
            };
        }
    }

    @Get('database/postgres')
    async checkPostgresHealth() {
        try {
            const isHealthy = await this.postgresService.healthCheck();
            const stats = await this.postgresService.getDatabaseStats().catch(() => null);

            return {
                status: isHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                service: 'postgresql',
                stats: stats ? stats.slice(0, 5) : null, // Show first 5 stats
            };
        } catch (error) {
            return {
                status: 'error',
                timestamp: new Date().toISOString(),
                service: 'postgresql',
                error: error.message,
            };
        }
    }

    @Get('migrations')
    async checkMigrations() {
        try {
            const status = await this.migrationService.getMigrationStatus();
            return {
                ...status,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            return {
                status: 'error',
                timestamp: new Date().toISOString(),
                error: error.message,
            };
        }
    }

    @Post('test-postgres-repositories')
    async testPostgresRepositories() {
        try {
            await this.testRepositoriesService.runAllTests();
            return {
                status: 'success',
                message: 'All PostgreSQL repository tests passed!',
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            return {
                status: 'error',
                message: 'PostgreSQL repository tests failed',
                error: error.message,
                timestamp: new Date().toISOString(),
            };
        }
    }
}
