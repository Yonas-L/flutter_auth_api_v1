import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Controller('health')
export class DatabaseController {
    constructor(private readonly databaseService: DatabaseService) { }

    @Get('database')
    async checkDatabaseHealth() {
        try {
            const isHealthy = await this.databaseService.healthCheck();
            return {
                status: isHealthy ? 'healthy' : 'unhealthy',
                timestamp: new Date().toISOString(),
                service: 'supabase',
            };
        } catch (error) {
            return {
                status: 'error',
                timestamp: new Date().toISOString(),
                service: 'supabase',
                error: error.message,
            };
        }
    }
}
