import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';
import { DocumentsPostgresRepository } from '../database/repositories/documents-postgres.repository';
import { UsersPostgresRepository } from '../database/repositories/users-postgres.repository';

export interface CompleteRegistrationData {
    // User data
    userId: string;
    userPhone: string;

    // Personal data (from step 1)
    fullName: string;
    email?: string;
    dateOfBirth: string;
    address: string;
    gender: string;
    phoneNumber: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    avatarUrl?: string;

    // Vehicle data (from step 2)
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: string;
    vehicleColor: string;
    vehiclePlateNumber: string;
    vehicleTransmission: string;
    vehicleClassId: string;
    driverLicenseNumber: string;
    driverLicenseExpiry: string;

    // Document URLs (from step 3)
    documentUrls: {
        driver_license?: string;
        vehicle_registration?: string;
        insurance?: string;
    };
}

export interface CompleteRegistrationResponse {
    success: boolean;
    message: string;
    userId: string;
    driverProfileId: string;
    vehicleId: string;
    verificationStatus: string;
    redirectTo: string;
}

@Injectable()
export class RegistrationService {
    private readonly logger = new Logger(RegistrationService.name);

    constructor(
        private readonly postgresService: PostgresService,
        private readonly documentsRepository: DocumentsPostgresRepository,
        private readonly usersRepository: UsersPostgresRepository,
    ) { }

    /**
     * Complete driver registration with all data in a single transaction
     */
    async completeDriverRegistration(data: CompleteRegistrationData): Promise<CompleteRegistrationResponse> {
        const client = await this.postgresService.getClient();

        try {
            await client.query('BEGIN');
            this.logger.log(`🚀 Starting complete driver registration for user: ${data.userId}`);

            // 1. Update user record with personal information
            await this.updateUserRecord(client, data);

            // 2. Create driver profile
            const driverProfileId = await this.createDriverProfile(client, data);

            // 3. Create vehicle record
            const vehicleId = await this.createVehicleRecord(client, data, driverProfileId);

            // 4. Create wallet account for the driver
            await this.createWalletAccount(client, data.userId);

            // 5. Assign driver role to user
            await this.assignDriverRole(client, data.userId);

            // 6. Update document records with proper relationships
            await this.updateDocumentRecords(client, data);

            await client.query('COMMIT');

            // Get the verification status for redirection
            const statusQuery = `
                SELECT verification_status FROM driver_profiles 
                WHERE user_id = $1
            `;
            const statusResult = await client.query(statusQuery, [data.userId]);
            const verificationStatus = statusResult.rows[0]?.verification_status || 'pending_review';

            this.logger.log(`✅ Driver registration completed successfully for user: ${data.userId} with status: ${verificationStatus}`);

            return {
                success: true,
                message: 'Driver registration completed successfully',
                userId: data.userId,
                driverProfileId,
                vehicleId,
                verificationStatus,
                redirectTo: verificationStatus === 'verified' ? 'home' : 'pending_verification'
            };

        } catch (error) {
            await client.query('ROLLBACK');
            this.logger.error(`❌ Driver registration failed for user ${data.userId}:`, error);
            throw new InternalServerErrorException(`Registration failed: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Update user record with personal information
     */
    private async updateUserRecord(client: any, data: CompleteRegistrationData): Promise<void> {
        this.logger.log(`📝 Updating user record for: ${data.userId}`);

        const query = `
            UPDATE users SET
                full_name = $1,
                email = $2,
                avatar_url = $3,
                date_of_birth = $4,
                gender = $5,
                emergency_contact_name = $6,
                emergency_contact_phone = $7,
                updated_at = NOW()
            WHERE id = $8
        `;

        const values = [
            data.fullName,
            data.email || null,
            data.avatarUrl || null,
            data.dateOfBirth,
            data.gender?.toLowerCase(), // Convert to lowercase to match database constraint
            data.emergencyContactName,
            data.emergencyContactPhone,
            data.userId
        ];

        await client.query(query, values);
        this.logger.log(`✅ User record updated for: ${data.userId}`);
    }

    /**
     * Create or update driver profile
     */
    private async createDriverProfile(client: any, data: CompleteRegistrationData): Promise<string> {
        this.logger.log(`👤 Creating or updating driver profile for: ${data.userId}`);

        const query = `
            INSERT INTO driver_profiles (
                user_id, first_name, last_name, date_of_birth, gender, city,
                emergency_contact_name, emergency_contact_phone,
                driver_license_number, driver_license_expiry,
                verification_status, is_available, is_online
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (user_id) DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                date_of_birth = EXCLUDED.date_of_birth,
                gender = EXCLUDED.gender,
                city = EXCLUDED.city,
                emergency_contact_name = EXCLUDED.emergency_contact_name,
                emergency_contact_phone = EXCLUDED.emergency_contact_phone,
                driver_license_number = EXCLUDED.driver_license_number,
                driver_license_expiry = EXCLUDED.driver_license_expiry,
                verification_status = EXCLUDED.verification_status,
                updated_at = NOW()
            RETURNING id
        `;

        const nameParts = data.fullName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        const values = [
            data.userId,
            firstName,
            lastName,
            data.dateOfBirth,
            data.gender?.toLowerCase(), // Convert to lowercase to match database constraint
            data.address,
            data.emergencyContactName,
            data.emergencyContactPhone,
            data.driverLicenseNumber,
            data.driverLicenseExpiry,
            'pending_review', // Initial verification status
            false, // Not available initially
            false  // Not online initially
        ];

        const result = await client.query(query, values);
        const driverProfileId = result.rows[0].id;

        this.logger.log(`✅ Driver profile created/updated with ID: ${driverProfileId}`);
        return driverProfileId;
    }

    /**
     * Create or update vehicle record
     */
    private async createVehicleRecord(client: any, data: CompleteRegistrationData, driverProfileId: string): Promise<string> {
        this.logger.log(`🚗 Creating or updating vehicle record for driver: ${driverProfileId}`);

        // First, check if vehicle already exists for this driver
        const checkQuery = `SELECT id FROM vehicles WHERE driver_id = $1 LIMIT 1`;
        const checkResult = await client.query(checkQuery, [driverProfileId]);

        if (checkResult.rows.length > 0) {
            // Update existing vehicle
            const updateQuery = `
                UPDATE vehicles SET
                    vehicle_type_id = $2,
                    name = $3,
                    make = $4,
                    model = $5,
                    year = $6,
                    plate_number = $7,
                    color = $8,
                    transmission = $9,
                    verification_status = $10,
                    updated_at = NOW()
                WHERE driver_id = $1
                RETURNING id
            `;

            const vehicleName = `${data.vehicleYear} ${data.vehicleMake} ${data.vehicleModel}`;

            const values = [
                driverProfileId,
                parseInt(data.vehicleClassId),
                vehicleName,
                data.vehicleMake,
                data.vehicleModel,
                parseInt(data.vehicleYear),
                data.vehiclePlateNumber,
                data.vehicleColor,
                data.vehicleTransmission,
                'pending_review'
            ];

            const result = await client.query(updateQuery, values);
            const vehicleId = result.rows[0].id;

            this.logger.log(`✅ Vehicle updated with ID: ${vehicleId}`);
            return vehicleId;
        } else {
            // Create new vehicle
            const insertQuery = `
                INSERT INTO vehicles (
                    driver_id, vehicle_type_id, name, make, model, year,
                    plate_number, color, transmission, verification_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            `;

            const vehicleName = `${data.vehicleYear} ${data.vehicleMake} ${data.vehicleModel}`;

            const values = [
                driverProfileId,
                parseInt(data.vehicleClassId),
                vehicleName,
                data.vehicleMake,
                data.vehicleModel,
                parseInt(data.vehicleYear),
                data.vehiclePlateNumber,
                data.vehicleColor,
                data.vehicleTransmission,
                'pending_review'
            ];

            const result = await client.query(insertQuery, values);
            const vehicleId = result.rows[0].id;

            this.logger.log(`✅ Vehicle created with ID: ${vehicleId}`);
            return vehicleId;
        }
    }

    /**
     * Create wallet account for the driver
     */
    private async createWalletAccount(client: any, userId: string): Promise<void> {
        this.logger.log(`💰 Creating wallet account for user: ${userId}`);

        const query = `
            INSERT INTO wallet_accounts (user_id, balance_cents, currency, is_active)
            VALUES ($1, 0, 'ETB', true)
            ON CONFLICT (user_id) DO NOTHING
        `;

        await client.query(query, [userId]);
        this.logger.log(`✅ Wallet account created for user: ${userId}`);
    }

    /**
     * Assign driver role to user
     */
    private async assignDriverRole(client: any, userId: string): Promise<void> {
        this.logger.log(`🔐 Assigning driver role to user: ${userId}`);

        // First, get the driver role ID
        const roleQuery = `SELECT id FROM roles WHERE name = 'driver' AND is_active = true`;
        const roleResult = await client.query(roleQuery);

        if (roleResult.rows.length === 0) {
            throw new BadRequestException('Driver role not found in database');
        }

        const roleId = roleResult.rows[0].id;

        // Assign the role to the user
        const assignQuery = `
            INSERT INTO user_roles (user_id, role_id, created_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (user_id, role_id) DO NOTHING
        `;

        await client.query(assignQuery, [userId, roleId]);
        this.logger.log(`✅ Driver role assigned to user: ${userId}`);
    }

    /**
     * Update document records with proper relationships
     */
    private async updateDocumentRecords(client: any, data: CompleteRegistrationData): Promise<void> {
        this.logger.log(`📄 Updating document records for user: ${data.userId}`);

        // Process each document type
        const documentTypes = ['profile_picture', 'driver_license', 'vehicle_registration', 'insurance'];

        for (const docType of documentTypes) {
            const documentUrl = data.documentUrls?.[docType];
            if (documentUrl) {
                // Check if document already exists for this user and type
                const checkQuery = `
                    SELECT id FROM documents 
                    WHERE user_id = $1 AND doc_type = $2 
                    ORDER BY uploaded_at DESC 
                    LIMIT 1
                `;
                const checkResult = await client.query(checkQuery, [data.userId, docType]);

                if (checkResult.rows.length > 0) {
                    // Update existing document
                    const updateQuery = `
                        UPDATE documents SET
                            file_path = $3,
                            public_url = $4,
                            verification_status = 'pending_review',
                            updated_at = NOW()
                        WHERE id = $5
                    `;

                    const documentId = checkResult.rows[0].id;
                    const filePath = documentUrl.split('/').slice(-2).join('/'); // Extract path from URL

                    await client.query(updateQuery, [
                        data.userId,
                        docType,
                        filePath,
                        documentUrl,
                        documentId
                    ]);

                    this.logger.log(`✅ Updated existing ${docType} document for user: ${data.userId}`);
                } else {
                    // Create new document record
                    const insertQuery = `
                        INSERT INTO documents (
                            user_id, doc_type, file_path, public_url, 
                            verification_status, notes
                        ) VALUES ($1, $2, $3, $4, $5, $6)
                    `;

                    const filePath = documentUrl.split('/').slice(-2).join('/'); // Extract path from URL

                    await client.query(insertQuery, [
                        data.userId,
                        docType,
                        filePath,
                        documentUrl,
                        'pending_review',
                        `Uploaded during registration - ${docType}`
                    ]);

                    this.logger.log(`✅ Created new ${docType} document for user: ${data.userId}`);
                }
            }
        }

        this.logger.log(`✅ Document records processed for user: ${data.userId}`);
    }

    /**
     * Get registration progress for a user
     */
    async getRegistrationProgress(userId: string): Promise<{
        isComplete: boolean;
        steps: {
            personalInfo: boolean;
            vehicleInfo: boolean;
            documents: boolean;
        };
        missingFields: string[];
    }> {
        try {
            // Check if user exists and has driver profile
            const userQuery = `
                SELECT u.*, dp.id as driver_profile_id, v.id as vehicle_id
                FROM users u
                LEFT JOIN driver_profiles dp ON u.id = dp.user_id
                LEFT JOIN vehicles v ON dp.id = v.driver_id
                WHERE u.id = $1
            `;

            const userResult = await this.postgresService.query(userQuery, [userId]);

            if (userResult.rows.length === 0) {
                return {
                    isComplete: false,
                    steps: { personalInfo: false, vehicleInfo: false, documents: false },
                    missingFields: ['User not found']
                };
            }

            const user = userResult.rows[0];
            const missingFields: string[] = [];

            // Check personal info completion
            const personalInfoComplete = !!(
                user.full_name &&
                user.date_of_birth &&
                user.gender &&
                user.emergency_contact_name &&
                user.emergency_contact_phone
            );

            if (!personalInfoComplete) {
                if (!user.full_name) missingFields.push('Full name');
                if (!user.date_of_birth) missingFields.push('Date of birth');
                if (!user.gender) missingFields.push('Gender');
                if (!user.emergency_contact_name) missingFields.push('Emergency contact name');
                if (!user.emergency_contact_phone) missingFields.push('Emergency contact phone');
            }

            // Check vehicle info completion
            const vehicleInfoComplete = !!(user.driver_profile_id && user.vehicle_id);

            if (!vehicleInfoComplete) {
                if (!user.driver_profile_id) missingFields.push('Driver profile');
                if (!user.vehicle_id) missingFields.push('Vehicle information');
            }

            // Check documents completion
            const documentsQuery = `
                SELECT doc_type FROM documents 
                WHERE user_id = $1 AND doc_type IN ('profile_picture', 'driver_license', 'vehicle_registration', 'insurance')
            `;

            const docsResult = await this.postgresService.query(documentsQuery, [userId]);
            const uploadedDocs = docsResult.rows.map(row => row.doc_type);
            const requiredDocs = ['profile_picture', 'driver_license', 'vehicle_registration', 'insurance'];
            const documentsComplete = requiredDocs.every(doc => uploadedDocs.includes(doc));

            if (!documentsComplete) {
                const missingDocs = requiredDocs.filter(doc => !uploadedDocs.includes(doc));
                missingFields.push(...missingDocs.map(doc => `${doc.replace('_', ' ')} document`));
            }

            const isComplete = personalInfoComplete && vehicleInfoComplete && documentsComplete;

            return {
                isComplete,
                steps: {
                    personalInfo: personalInfoComplete,
                    vehicleInfo: vehicleInfoComplete,
                    documents: documentsComplete
                },
                missingFields
            };

        } catch (error) {
            this.logger.error(`Error getting registration progress for user ${userId}:`, error);
            throw new InternalServerErrorException('Failed to get registration progress');
        }
    }
}
