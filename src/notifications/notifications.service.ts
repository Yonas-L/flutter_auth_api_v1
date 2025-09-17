import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

@Injectable()
export class NotificationsService {
    constructor(
        @InjectRepository(Notification)
        private notificationRepository: Repository<Notification>,
    ) { }

    async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
        const notification = this.notificationRepository.create(createNotificationDto);
        return await this.notificationRepository.save(notification);
    }

    async findAll(userId: string, page: number = 1, limit: number = 20): Promise<{
        notifications: Notification[];
        total: number;
        page: number;
        limit: number;
    }> {
        const [notifications, total] = await this.notificationRepository.findAndCount({
            where: { user_id: userId },
            order: { created_at: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        return {
            notifications,
            total,
            page,
            limit,
        };
    }

    async findUnread(userId: string): Promise<Notification[]> {
        return await this.notificationRepository.find({
            where: {
                user_id: userId,
                is_read: false,
                delivery_status: 'delivered'
            },
            order: { created_at: 'DESC' },
        });
    }

    async findOne(id: number): Promise<Notification | null> {
        return await this.notificationRepository.findOne({ where: { id } });
    }

    async markAsRead(id: number): Promise<Notification | null> {
        const notification = await this.findOne(id);
        if (notification) {
            notification.is_read = true;
            notification.read_at = new Date();
            return await this.notificationRepository.save(notification);
        }
        return null;
    }

    async markAllAsRead(userId: string): Promise<void> {
        await this.notificationRepository.update(
            { user_id: userId, is_read: false },
            { is_read: true, read_at: new Date() }
        );
    }

    async update(id: number, updateNotificationDto: UpdateNotificationDto): Promise<Notification | null> {
        await this.notificationRepository.update(id, updateNotificationDto);
        return await this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.notificationRepository.delete(id);
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
        await this.notificationRepository.update(id, {
            delivery_status: 'delivered',
            sent_at: new Date(),
        });
    }

    async markAsFailed(id: number): Promise<void> {
        await this.notificationRepository.update(id, {
            delivery_status: 'failed',
        });
    }
}
