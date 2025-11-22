import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PostgresService } from '../database/postgres.service';
import { UsersPostgresRepository } from '../database/repositories/users-postgres.repository';
import { OtpService } from '../otp/otp.service';
import { normalizePhoneNumber, validateEthiopianPhoneNumber } from './utils/phone.utils';
import { UpdatePassengerProfileDto } from './dto/update-passenger-profile.dto';
import { CreateFavoritePlaceDto } from './dto/create-favorite-place.dto';
import { RateTripDto } from './dto/rate-trip.dto';

@Injectable()
export class PassengersService {
    private readonly logger = new Logger(PassengersService.name);

    constructor(
        private readonly postgresService: PostgresService,
        private readonly usersRepository: UsersPostgresRepository,
        private readonly otpService: OtpService,
        private readonly jwtService: JwtService,
    ) { }

    /**
     * Send OTP to passenger's phone number
     */
    async sendLoginOtp(phoneNumber: string): Promise<{ message: string }> {
        try {
            // Validate phone number
            if (!validateEthiopianPhoneNumber(phoneNumber)) {
                throw new HttpException(
                    'Valid Ethiopian phone number is required',
                    HttpStatus.BAD_REQUEST,
                );
            }

            const normalizedPhone = normalizePhoneNumber(phoneNumber);
            this.logger.log(`Sending OTP to passenger: ${normalizedPhone}`);

            // Create or get user
            await this.postgresService.query(
                'INSERT INTO users (phone_number, user_type) VALUES ($1, $2) ON CONFLICT (phone_number) DO NOTHING',
                [normalizedPhone, 'passenger'],
            );

            // Use existing OTP service to generate and send OTP
            await this.otpService.createOtpForPhone(normalizedPhone, 10, 'login');

            return { message: 'OTP sent successfully to your phone.' };
        } catch (error) {
            this.logger.error(`Failed to send OTP: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'Could not send verification code. Please try again later.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Verify OTP and return JWT token
     */
    async verifyOtp(phoneNumber: string, otp: string): Promise<{ message: string; token: string; userId: string }> {
        try {
            const normalizedPhone = normalizePhoneNumber(phoneNumber);

            // Get latest OTP
            const otpQuery = `
                SELECT id, code_hash, expires_at FROM otp_codes 
                WHERE phone_number = $1 AND is_used = false AND purpose = 'login' 
                ORDER BY created_at DESC LIMIT 1
            `;
            const { rows: otpRows } = await this.postgresService.query(otpQuery, [normalizedPhone]);
            const otpRecord = otpRows[0];

            if (!otpRecord) {
                throw new HttpException(
                    'No valid OTP found for this number. Please request a new one.',
                    HttpStatus.NOT_FOUND,
                );
            }

            // Check expiration
            if (new Date() > new Date(otpRecord.expires_at)) {
                throw new HttpException(
                    'OTP has expired. Please request a new one.',
                    HttpStatus.BAD_REQUEST,
                );
            }

            // Verify OTP
            const isValidOtp = await bcrypt.compare(otp, otpRecord.code_hash);
            if (!isValidOtp) {
                throw new HttpException('Invalid verification code.', HttpStatus.BAD_REQUEST);
            }

            // Use transaction
            const client = await this.postgresService.getClient();
            try {
                await client.query('BEGIN');

                // Mark OTP as used
                await client.query(
                    'UPDATE otp_codes SET is_used = true, used_at = NOW() WHERE id = $1',
                    [otpRecord.id],
                );

                // Update user
                const { rows: userRows } = await client.query(
                    'UPDATE users SET is_phone_verified = true, last_login_at = NOW() WHERE phone_number = $1 RETURNING id, user_type',
                    [normalizedPhone],
                );
                const user = userRows[0];

                await client.query('COMMIT');

                // Generate JWT
                const token = this.jwtService.sign(
                    {
                        sub: user.id,
                        phoneNumber: normalizedPhone,
                        userType: user.user_type,
                    },
                    { expiresIn: '30d' },
                );

                this.logger.log(`Passenger ${user.id} logged in successfully`);

                return {
                    message: 'Verification successful.',
                    token,
                    userId: user.id,
                };
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        } catch (error) {
            this.logger.error(`Failed to verify OTP: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get passenger profile
     */
    async getProfile(userId: string): Promise<any> {
        try {
            const user = await this.usersRepository.findById(userId);
            if (!user) {
                throw new HttpException('User profile not found.', HttpStatus.NOT_FOUND);
            }

            return {
                phone_number: user.phone_number,
                full_name: user.full_name,
                email: user.email,
                avatar_url: user.avatar_url,
            };
        } catch (error) {
            this.logger.error(`Failed to get profile: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Update passenger profile
     */
    async updateProfile(userId: string, updateDto: UpdatePassengerProfileDto): Promise<any> {
        try {
            const fields: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (updateDto.full_name !== undefined) {
                fields.push(`full_name = $${paramIndex++}`);
                values.push(updateDto.full_name);
            }
            if (updateDto.email !== undefined) {
                fields.push(`email = $${paramIndex++}`);
                values.push(updateDto.email);
            }
            if (updateDto.avatar_url !== undefined) {
                fields.push(`avatar_url = $${paramIndex++}`);
                values.push(updateDto.avatar_url);
            }

            if (fields.length === 0) {
                throw new HttpException('No update data provided.', HttpStatus.BAD_REQUEST);
            }

            values.push(userId);
            const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING id, phone_number, full_name, email, avatar_url`;
            const { rows } = await this.postgresService.query(query, values);

            return {
                message: 'Profile updated successfully.',
                user: rows[0],
            };
        } catch (error) {
            this.logger.error(`Failed to update profile: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get trip history for passenger
     */
    async getTripHistory(userId: string): Promise<any[]> {
        try {
            const query = `
                SELECT 
                    id, passenger_id, status,
                    pickup_address, pickup_latitude, pickup_longitude,
                    dropoff_address, dropoff_latitude, dropoff_longitude,
                    final_fare_cents, estimated_distance_km, actual_distance_km,
                    created_at, completed_at, passenger_rating, passenger_comment,
                    driver_details, selected_vehicle_details
                FROM trips 
                WHERE passenger_id = $1
                ORDER BY created_at DESC
            `;
            const { rows } = await this.postgresService.query(query, [userId]);
            return rows;
        } catch (error) {
            this.logger.error(`Failed to get trip history: ${error.message}`);
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Rate a completed trip
     */
    async rateTrip(userId: string, tripId: string, rateDto: RateTripDto): Promise<{ message: string }> {
        const client = await this.postgresService.getClient();

        try {
            await client.query('BEGIN');

            // Update trip rating
            const { rows: tripRows } = await client.query(
                'UPDATE trips SET passenger_rating = $1, passenger_comment = $2 WHERE id = $3 AND passenger_id = $4 RETURNING driver_id',
                [rateDto.rating, rateDto.comment || null, tripId, userId],
            );

            if (tripRows.length === 0) {
                await client.query('ROLLBACK');
                throw new HttpException(
                    'Trip not found or you are not authorized to rate it.',
                    HttpStatus.NOT_FOUND,
                );
            }

            const driverProfileId = tripRows[0].driver_id;

            // Update driver rating average
            if (driverProfileId) {
                const updateDriverRatingQuery = `
                    UPDATE driver_profiles SET
                        rating_count = (SELECT COUNT(passenger_rating) FROM trips WHERE driver_id = $1),
                        rating_avg = (SELECT AVG(passenger_rating) FROM trips WHERE driver_id = $1 AND passenger_rating IS NOT NULL)
                    WHERE id = $1
                `;
                await client.query(updateDriverRatingQuery, [driverProfileId]);
            }

            await client.query('COMMIT');

            return { message: 'Thank you for your feedback!' };
        } catch (error) {
            await client.query('ROLLBACK');
            this.logger.error(`Failed to rate trip: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        } finally {
            client.release();
        }
    }

    /**
     * Get favorite places
     */
    async getFavoritePlaces(userId: string): Promise<any[]> {
        try {
            const query = 'SELECT id, user_id, label, address, latitude, longitude, icon FROM favorite_places WHERE user_id = $1 ORDER BY created_at ASC';
            const { rows } = await this.postgresService.query(query, [userId]);
            return rows;
        } catch (error) {
            this.logger.error(`Failed to get favorite places: ${error.message}`);
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Create favorite place
     */
    async createFavoritePlace(userId: string, createDto: CreateFavoritePlaceDto): Promise<any> {
        try {
            const query = 'INSERT INTO favorite_places (user_id, label, address, latitude, longitude, icon) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *';
            const { rows } = await this.postgresService.query(query, [
                userId,
                createDto.label,
                createDto.address,
                createDto.latitude,
                createDto.longitude,
                createDto.icon,
            ]);
            return rows[0];
        } catch (error) {
            this.logger.error(`Failed to create favorite place: ${error.message}`);
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Delete favorite place
     */
    async deleteFavoritePlace(userId: string, favoritePlaceId: string): Promise<{ message: string }> {
        try {
            const query = 'DELETE FROM favorite_places WHERE id = $1 AND user_id = $2';
            const result = await this.postgresService.query(query, [favoritePlaceId, userId]);

            if (result.rowCount === 0) {
                throw new HttpException(
                    'Favorite place not found or you do not have permission to delete it.',
                    HttpStatus.NOT_FOUND,
                );
            }

            return { message: 'Favorite place removed successfully.' };
        } catch (error) {
            this.logger.error(`Failed to delete favorite place: ${error.message}`);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get notifications for passenger
     */
    async getNotifications(userId: string): Promise<any[]> {
        try {
            const query = 'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC';
            const { rows } = await this.postgresService.query(query, [userId]);
            return rows;
        } catch (error) {
            this.logger.error(`Failed to get notifications: ${error.message}`);
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Mark all notifications as read
     */
    async markAllNotificationsAsRead(userId: string): Promise<{ message: string }> {
        try {
            const query = 'UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false';
            await this.postgresService.query(query, [userId]);
            return { message: 'All notifications marked as read.' };
        } catch (error) {
            this.logger.error(`Failed to mark notifications as read: ${error.message}`);
            throw new HttpException(
                'An internal server error occurred.',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}
