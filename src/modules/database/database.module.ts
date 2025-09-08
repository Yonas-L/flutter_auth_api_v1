import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database.service';
import { PostgresService } from './postgres.service';
import { MigrationService } from './migration.service';
import { DatabaseController } from './database.controller';
import {
    UsersRepository,
    DriverProfilesRepository,
    VehiclesRepository,
    DocumentsRepository,
    OtpRepository
} from './repositories';
import {
    UsersPostgresRepository,
    TripsPostgresRepository,
    OtpPostgresRepository
} from './repositories';
import { TestPostgresRepositoriesService } from './test-postgres-repositories.service';

@Global()
@Module({
    imports: [ConfigModule],
    controllers: [DatabaseController],
    providers: [
        DatabaseService, // Keep for backward compatibility during migration
        PostgresService, // New PostgreSQL service
        MigrationService, // Database migration service
        // Legacy Supabase repositories
        UsersRepository,
        DriverProfilesRepository,
        VehiclesRepository,
        DocumentsRepository,
        OtpRepository,
        // New PostgreSQL repositories
        UsersPostgresRepository,
        TripsPostgresRepository,
        OtpPostgresRepository,
        // Test service
        TestPostgresRepositoriesService,
    ],
    exports: [
        DatabaseService, // Keep for backward compatibility
        PostgresService, // Export new service
        MigrationService, // Export migration service
        // Legacy Supabase repositories
        UsersRepository,
        DriverProfilesRepository,
        VehiclesRepository,
        DocumentsRepository,
        OtpRepository,
        // New PostgreSQL repositories
        UsersPostgresRepository,
        TripsPostgresRepository,
        OtpPostgresRepository,
    ],
})
export class DatabaseModule { }
