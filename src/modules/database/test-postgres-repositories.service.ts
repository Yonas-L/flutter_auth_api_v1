import { Injectable, Logger } from '@nestjs/common';
import { UsersPostgresRepository } from './repositories/users-postgres.repository';
import { TripsPostgresRepository } from './repositories/trips-postgres.repository';
import { PostgresService } from './postgres.service';

@Injectable()
export class TestPostgresRepositoriesService {
    private readonly logger = new Logger(TestPostgresRepositoriesService.name);

    constructor(
        private readonly usersRepository: UsersPostgresRepository,
        private readonly tripsRepository: TripsPostgresRepository,
        private readonly postgresService: PostgresService
    ) {}

    async testUserOperations(): Promise<void> {
        this.logger.log('🧪 Testing User Operations...');

        try {
            // Test creating a user
            const testUser = await this.usersRepository.create({
                phone_number: '+251911234567',
                full_name: 'Test User',
                email: 'test@example.com',
                user_type: 'passenger',
                is_phone_verified: true,
                is_email_verified: false,
                is_active: true,
                status: 'verified',
                preferred_language: 'en',
                notification_preferences: 'all'
            });

            this.logger.log(`✅ Created user: ${testUser.id}`);

            // Test finding by ID
            const foundUser = await this.usersRepository.findById(testUser.id);
            this.logger.log(`✅ Found user by ID: ${foundUser?.full_name}`);

            // Test finding by phone
            const userByPhone = await this.usersRepository.findByPhone('+251911234567');
            this.logger.log(`✅ Found user by phone: ${userByPhone?.full_name}`);

            // Test updating user
            const updatedUser = await this.usersRepository.update(testUser.id, {
                full_name: 'Updated Test User',
                is_email_verified: true
            });
            this.logger.log(`✅ Updated user: ${updatedUser?.full_name}`);

            // Test user stats
            const stats = await this.usersRepository.getUserStats();
            this.logger.log(`✅ User stats: ${JSON.stringify(stats)}`);

            // Clean up
            await this.usersRepository.delete(testUser.id);
            this.logger.log(`✅ Cleaned up test user`);

        } catch (error) {
            this.logger.error('❌ User operations test failed:', error);
            throw error;
        }
    }

    async testTripOperations(): Promise<void> {
        this.logger.log('🧪 Testing Trip Operations...');

        try {
            // First create a test user
            const testUser = await this.usersRepository.create({
                phone_number: '+251911234568',
                full_name: 'Trip Test User',
                user_type: 'passenger',
                is_phone_verified: true,
                is_active: true,
                status: 'verified'
            });

            // Test creating a trip
            const testTrip = await this.tripsRepository.create({
                passenger_id: testUser.id,
                status: 'requested',
                pickup_address: 'Test Pickup Location',
                dropoff_address: 'Test Dropoff Location',
                pickup_latitude: 9.005401,
                pickup_longitude: 38.763611,
                dropoff_latitude: 9.010000,
                dropoff_longitude: 38.770000,
                estimated_fare_cents: 5000,
                trip_type: 'standard',
                passenger_count: 1,
                payment_method: 'cash',
                payment_status: 'pending',
                trip_reference: 'TEST-' + Date.now(),
                estimated_wait_time_minutes: 5,
                surge_multiplier: 1.0,
                discount_cents: 0,
                tip_cents: 0,
                platform_fee_cents: 0,
                cancellation_fee_cents: 0,
                request_timestamp: new Date().toISOString()
            });

            this.logger.log(`✅ Created trip: ${testTrip.id}`);

            // Test finding by passenger ID
            const userTrips = await this.tripsRepository.findByPassengerId(testUser.id);
            this.logger.log(`✅ Found ${userTrips.length} trips for user`);

            // Test updating trip status
            const updatedTrip = await this.tripsRepository.updateStatus(testTrip.id, 'accepted');
            this.logger.log(`✅ Updated trip status to: ${updatedTrip?.status}`);

            // Test trip stats
            const tripStats = await this.tripsRepository.getTripStats(testUser.id);
            this.logger.log(`✅ Trip stats: ${JSON.stringify(tripStats)}`);

            // Clean up
            await this.tripsRepository.delete(testTrip.id);
            await this.usersRepository.delete(testUser.id);
            this.logger.log(`✅ Cleaned up test data`);

        } catch (error) {
            this.logger.error('❌ Trip operations test failed:', error);
            throw error;
        }
    }

    async testDatabaseConnection(): Promise<void> {
        this.logger.log('🧪 Testing Database Connection...');

        try {
            const result = await this.postgresService.query('SELECT NOW() as current_time, version() as postgres_version');
            this.logger.log(`✅ Database connection successful`);
            this.logger.log(`   Current time: ${result.rows[0].current_time}`);
            this.logger.log(`   PostgreSQL version: ${result.rows[0].postgres_version}`);

            // Test table existence
            const tablesResult = await this.postgresService.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('users', 'trips', 'vehicle_types')
                ORDER BY table_name
            `);

            this.logger.log(`✅ Found ${tablesResult.rows.length} key tables: ${tablesResult.rows.map(r => r.table_name).join(', ')}`);

        } catch (error) {
            this.logger.error('❌ Database connection test failed:', error);
            throw error;
        }
    }

    async runAllTests(): Promise<void> {
        this.logger.log('🚀 Starting PostgreSQL Repository Tests...');

        try {
            await this.testDatabaseConnection();
            await this.testUserOperations();
            await this.testTripOperations();

            this.logger.log('🎉 All PostgreSQL repository tests passed!');
        } catch (error) {
            this.logger.error('💥 PostgreSQL repository tests failed:', error);
            throw error;
        }
    }
}
