import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';

@Injectable()
export class AdsService {
    private readonly logger = new Logger(AdsService.name);

    constructor(private readonly postgresService: PostgresService) { }

    /**
     * Get all ads with pagination
     */
    async getAds(page: number = 1, limit: number = 20) {
        try {
            const offset = (page - 1) * limit;

            const adsQuery = `
                SELECT 
                    id,
                    title,
                    description,
                    image_url,
                    target_url,
                    target_user_type,
                    is_active,
                    sort_order,
                    start_date,
                    end_date,
                    click_count,
                    impression_count,
                    created_at,
                    updated_at
                FROM ads
                ORDER BY sort_order ASC, created_at DESC
                LIMIT $1 OFFSET $2
            `;

            const countQuery = `SELECT COUNT(*) as total FROM ads`;

            const [adsResult, countResult] = await Promise.all([
                this.postgresService.query(adsQuery, [limit, offset]),
                this.postgresService.query(countQuery, []),
            ]);

            const ads = adsResult.rows || [];
            const total = parseInt(countResult.rows[0]?.total || '0');

            return {
                success: true,
                ads,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            this.logger.error(`Error fetching ads: ${error.message}`);
            throw new HttpException(
                'Failed to fetch ads',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get ad by ID
     */
    async getAdById(id: number) {
        try {
            const query = `SELECT * FROM ads WHERE id = $1`;
            const result = await this.postgresService.query(query, [id]);

            if (result.rows.length === 0) {
                throw new HttpException('Ad not found', HttpStatus.NOT_FOUND);
            }

            return {
                success: true,
                ad: result.rows[0],
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            this.logger.error(`Error fetching ad: ${error.message}`);
            throw new HttpException(
                'Failed to fetch ad',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Create ad
     */
    async createAd(createAdDto: any) {
        try {
            const {
                title,
                description,
                image_url,
                target_url,
                target_user_type,
                is_active,
                sort_order,
                start_date,
                end_date,
            } = createAdDto;

            // Validate required fields
            if (!title || !image_url) {
                throw new HttpException(
                    'Title and image_url are required',
                    HttpStatus.BAD_REQUEST,
                );
            }

            // Validate target_user_type
            if (target_user_type && !['passenger', 'driver', 'all'].includes(target_user_type)) {
                throw new HttpException(
                    'Invalid target_user_type. Must be passenger, driver, or all',
                    HttpStatus.BAD_REQUEST,
                );
            }

            const insertQuery = `
                INSERT INTO ads (
                    title,
                    description,
                    image_url,
                    target_url,
                    target_user_type,
                    is_active,
                    sort_order,
                    start_date,
                    end_date
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `;

            const result = await this.postgresService.query(insertQuery, [
                title,
                description || null,
                image_url,
                target_url || null,
                target_user_type || 'all',
                is_active !== undefined ? is_active : true,
                sort_order || 0,
                start_date || null,
                end_date || null,
            ]);

            this.logger.log(`✅ Ad created: ${result.rows[0].id}`);

            return {
                success: true,
                ad: result.rows[0],
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            this.logger.error(`Error creating ad: ${error.message}`);
            throw new HttpException(
                'Failed to create ad',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Update ad
     */
    async updateAd(id: number, updateAdDto: any) {
        try {
            const {
                title,
                description,
                image_url,
                target_url,
                target_user_type,
                is_active,
                sort_order,
                start_date,
                end_date,
            } = updateAdDto;

            // Build update query dynamically
            const updates: string[] = [];
            const values: any[] = [];
            let paramCount = 0;

            if (title !== undefined) {
                paramCount++;
                updates.push(`title = $${paramCount}`);
                values.push(title);
            }
            if (description !== undefined) {
                paramCount++;
                const descValue = description === null || description === '' ? null : description;
                updates.push(`description = $${paramCount}`);
                values.push(descValue);
            }
            if (image_url !== undefined) {
                paramCount++;
                updates.push(`image_url = $${paramCount}`);
                values.push(image_url);
            }
            if (target_url !== undefined) {
                paramCount++;
                const urlValue = target_url === null || target_url === '' ? null : target_url;
                updates.push(`target_url = $${paramCount}`);
                values.push(urlValue);
            }
            if (target_user_type !== undefined) {
                if (!['passenger', 'driver', 'all'].includes(target_user_type)) {
                    throw new HttpException(
                        'Invalid target_user_type',
                        HttpStatus.BAD_REQUEST,
                    );
                }
                paramCount++;
                updates.push(`target_user_type = $${paramCount}`);
                values.push(target_user_type);
            }
            if (is_active !== undefined) {
                paramCount++;
                updates.push(`is_active = $${paramCount}::boolean`);
                values.push(Boolean(is_active));
            }
            if (sort_order !== undefined) {
                paramCount++;
                updates.push(`sort_order = $${paramCount}::integer`);
                values.push(parseInt(String(sort_order), 10));
            }
            if (start_date !== undefined) {
                if (start_date === null || start_date === '') {
                    updates.push(`start_date = NULL`);
                } else {
                    paramCount++;
                    updates.push(`start_date = $${paramCount}::timestamp with time zone`);
                    values.push(start_date);
                }
            }
            if (end_date !== undefined) {
                if (end_date === null || end_date === '') {
                    updates.push(`end_date = NULL`);
                } else {
                    paramCount++;
                    updates.push(`end_date = $${paramCount}::timestamp with time zone`);
                    values.push(end_date);
                }
            }

            if (updates.length === 0) {
                throw new HttpException(
                    'No fields to update',
                    HttpStatus.BAD_REQUEST,
                );
            }

            // Add updated_at (no parameter needed for NOW())
            updates.push(`updated_at = NOW()`);

            // Add WHERE clause with id parameter
            paramCount++;
            values.push(id);

            const updateQuery = `
                UPDATE ads
                SET ${updates.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await this.postgresService.query(updateQuery, values);

            if (result.rows.length === 0) {
                throw new HttpException('Ad not found', HttpStatus.NOT_FOUND);
            }

            this.logger.log(`✅ Ad updated: ${id}`);

            return {
                success: true,
                ad: result.rows[0],
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            this.logger.error(`Error updating ad: ${error.message}`);
            throw new HttpException(
                'Failed to update ad',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Delete ad
     */
    async deleteAd(id: number) {
        try {
            const query = `DELETE FROM ads WHERE id = $1 RETURNING id`;
            const result = await this.postgresService.query(query, [id]);

            if (result.rows.length === 0) {
                throw new HttpException('Ad not found', HttpStatus.NOT_FOUND);
            }

            this.logger.log(`✅ Ad deleted: ${id}`);

            return {
                success: true,
                message: 'Ad deleted successfully',
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            this.logger.error(`Error deleting ad: ${error.message}`);
            throw new HttpException(
                'Failed to delete ad',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}

