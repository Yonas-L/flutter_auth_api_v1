import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresService } from './postgres.service';
import { DatabaseService } from './database.service';
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
    OtpPostgresRepository,
    DocumentsPostgresRepository
} from './repositories';
import { TestPostgresRepositoriesService } from './test-postgres-repositories.service';

@Global()
@Module({
    imports: [ConfigModule],
    controllers: [DatabaseController],
    providers: [
        DatabaseService, // Legacy (Supabase) service to satisfy old repositories; no-op if env missing
        PostgresService, // PostgreSQL service
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
        DocumentsPostgresRepository,
        // Test service
        TestPostgresRepositoriesService,
    ],
    exports: [
        DatabaseService, // Export legacy service for any remaining injections
        PostgresService, // Export PostgreSQL service
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
        DocumentsPostgresRepository,
    ],
})
export class DatabaseModule { }
