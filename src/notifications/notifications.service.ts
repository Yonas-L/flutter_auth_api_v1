import { Injectable } from '@nestjs/common';
import { PostgresService } from '../modules/database/postgres.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

export interface Notification {
    id: number;
    user_id: string;
    title: string;
    body: string;
    type: string;
    metadata?: Record<string, any>;
    is_read: boolean;
    read_at?: Date;
    created_at: Date;
    notification_type: string;
    reference_id?: string;
    reference_type?: string;
    priority: string;
    action_url?: string;
    expires_at?: Date;
    notification_category: string;
    is_silent: boolean;
    scheduled_at?: Date;
    sent_at?: Date;
    delivery_status: string;
}

@Injectable()
export class NotificationsService {
    constructor(private postgresService: PostgresService) { }

    async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
        const {
            user_id,
            title,
            body,
            type = 'general',
            metadata,
            is_read = false,
            read_at,
            notification_type = 'general',
            reference_id,
            reference_type,
            priority = 'normal',
            action_url,
            expires_at,
            notification_category = 'general',
            is_silent = false,
            scheduled_at,
            sent_at,
            delivery_status = 'pending',
        } = createNotificationDto;

        const query = `
      INSERT INTO notifications (
        user_id, title, body, type, metadata, is_read, read_at,
        notification_type, reference_id, reference_type, priority,
        action_url, expires_at, notification_category, is_silent,
        scheduled_at, sent_at, delivery_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;

        const values = [
            user_id, title, body, type, metadata ? JSON.stringify(metadata) : null,
            is_read, read_at, notification_type, reference_id, reference_type,
            priority, action_url, expires_at, notification_category, is_silent,
            scheduled_at, sent_at, delivery_status
        ];

        const result = await this.postgresService.query(query, values);
        return this.mapRowToNotification(result.rows[0]);
    }

    async findAll(userId: string, page: number = 1, limit: number = 20): Promise<{
        notifications: Notification[];
        total: number;
        page: number;
        limit: number;
    }> {
        const offset = (page - 1) * limit;

        // Get total count
        const countQuery = 'SELECT COUNT(*) FROM notifications WHERE user_id = $1';
        const countResult = await this.postgresService.query(countQuery, [userId]);
        const total = parseInt(countResult.rows[0].count);

        // Get notifications
        const query = `
      SELECT * FROM notifications 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
        const result = await this.postgresService.query(query, [userId, limit, offset]);

        return {
            notifications: result.rows.map(row => this.mapRowToNotification(row)),
            total,
            page,
            limit,
        };
    }

    async findUnread(userId: string): Promise<Notification[]> {
        const query = `
      SELECT * FROM notifications 
      WHERE user_id = $1 AND is_read = false AND delivery_status = 'delivered'
      ORDER BY created_at DESC
    `;
        const result = await this.postgresService.query(query, [userId]);
        return result.rows.map(row => this.mapRowToNotification(row));
    }

    async findOne(id: number): Promise<Notification | null> {
        const query = 'SELECT * FROM notifications WHERE id = $1';
        const result = await this.postgresService.query(query, [id]);

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapRowToNotification(result.rows[0]);
    }

    async markAsRead(id: number): Promise<Notification | null> {
        const query = `
      UPDATE notifications 
      SET is_read = true, read_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;
        const result = await this.postgresService.query(query, [id]);

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapRowToNotification(result.rows[0]);
    }

    async markAllAsRead(userId: string): Promise<void> {
        const query = `
      UPDATE notifications 
      SET is_read = true, read_at = NOW() 
      WHERE user_id = $1 AND is_read = false
    `;
        await this.postgresService.query(query, [userId]);
    }

    async update(id: number, updateNotificationDto: UpdateNotificationDto): Promise<Notification | null> {
        const fields: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        Object.entries(updateNotificationDto).forEach(([key, value]) => {
            if (value !== undefined) {
                if (key === 'metadata' && typeof value === 'object') {
                    fields.push(`${key} = $${paramCount}`);
                    values.push(JSON.stringify(value));
                } else {
                    fields.push(`${key} = $${paramCount}`);
                    values.push(value);
                }
                paramCount++;
            }
        });

        if (fields.length === 0) {
            return await this.findOne(id);
        }

        values.push(id);
        const query = `
      UPDATE notifications 
      SET ${fields.join(', ')} 
      WHERE id = $${paramCount} 
      RETURNING *
    `;

        const result = await this.postgresService.query(query, values);

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapRowToNotification(result.rows[0]);
    }

    async remove(id: number): Promise<void> {
        const query = 'DELETE FROM notifications WHERE id = $1';
        await this.postgresService.query(query, [id]);
    }

    // Trip-specific notification methods
    async createTripStartedNotification(
        userId: string,
        tripId: string,
        passengerName: string,
        pickupAddress: string,
        dropoffAddress: string,
    ): Promise<Notification> {
        return await this.create({
            user_id: userId,
            title: 'Trip Started! 🚗',
            body: `Trip with ${passengerName} from ${pickupAddress} to ${dropoffAddress} has started`,
            type: 'trip',
            notification_type: 'trip_update',
            notification_category: 'trip',
            reference_id: tripId,
            reference_type: 'trip',
            priority: 'high',
            action_url: `/trip-progress?tripId=${tripId}`,
            metadata: {
                trip_id: tripId,
                passenger_name: passengerName,
                pickup_address: pickupAddress,
                dropoff_address: dropoffAddress,
                event_type: 'trip_started'
            },
        });
    }

    async createTripCompletedNotification(
        userId: string,
        tripId: string,
        passengerName: string,
        pickupAddress: string,
        dropoffAddress: string,
        finalFare: number,
    ): Promise<Notification> {
        return await this.create({
            user_id: userId,
            title: 'Trip Completed! ✅',
            body: `Successfully completed trip with ${passengerName} from ${pickupAddress} to ${dropoffAddress} - ETB ${finalFare.toFixed(0)}`,
            type: 'trip',
            notification_type: 'trip_update',
            notification_category: 'trip',
            reference_id: tripId,
            reference_type: 'trip',
            priority: 'normal',
            action_url: `/history-enhanced`,
            metadata: {
                trip_id: tripId,
                passenger_name: passengerName,
                pickup_address: pickupAddress,
                dropoff_address: dropoffAddress,
                final_fare: finalFare,
                event_type: 'trip_completed'
            },
        });
    }

    async createTripRequestNotification(
        userId: string,
        tripId: string,
        passengerName: string,
        pickupAddress: string,
        dropoffAddress: string,
        estimatedFare: number,
    ): Promise<Notification> {
        return await this.create({
            user_id: userId,
            title: 'New Trip Request! 🚕',
            body: `New trip request from ${passengerName} from ${pickupAddress} to ${dropoffAddress} - ETB ${estimatedFare.toFixed(0)}`,
            type: 'trip',
            notification_type: 'trip_update',
            notification_category: 'trip',
            reference_id: tripId,
            reference_type: 'trip',
            priority: 'urgent',
            action_url: `/home`,
            metadata: {
                trip_id: tripId,
                passenger_name: passengerName,
                pickup_address: pickupAddress,
                dropoff_address: dropoffAddress,
                estimated_fare: estimatedFare,
                event_type: 'trip_request'
            },
        });
    }

    // Update delivery status
    async markAsDelivered(id: number): Promise<void> {
        const query = `
      UPDATE notifications 
      SET delivery_status = 'delivered', sent_at = NOW() 
      WHERE id = $1
    `;
        await this.postgresService.query(query, [id]);
    }

    async markAsFailed(id: number): Promise<void> {
        const query = `
      UPDATE notifications 
      SET delivery_status = 'failed' 
      WHERE id = $1
    `;
        await this.postgresService.query(query, [id]);
    }

    private mapRowToNotification(row: any): Notification {
        return {
            id: row.id,
            user_id: row.user_id,
            title: row.title,
            body: row.body,
            type: row.type,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            is_read: row.is_read,
            read_at: row.read_at,
            created_at: row.created_at,
            notification_type: row.notification_type,
            reference_id: row.reference_id,
            reference_type: row.reference_type,
            priority: row.priority,
            action_url: row.action_url,
            expires_at: row.expires_at,
            notification_category: row.notification_category,
            is_silent: row.is_silent,
            scheduled_at: row.scheduled_at,
            sent_at: row.sent_at,
            delivery_status: row.delivery_status,
        };
    }
}