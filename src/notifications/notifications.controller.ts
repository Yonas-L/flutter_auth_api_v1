import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UseGuards,
    Request,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';

@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Post()
    create(@Body() createNotificationDto: CreateNotificationDto) {
        return this.notificationsService.create(createNotificationDto);
    }

    @Get()
    findAll(
        @Request() req,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '20',
    ) {
        const userId = req.user.id;
        return this.notificationsService.findAll(userId, parseInt(page), parseInt(limit));
    }

    @Get('unread')
    findUnread(@Request() req) {
        const userId = req.user.id;
        return this.notificationsService.findUnread(userId);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.notificationsService.findOne(+id);
    }

    @Patch(':id/read')
    markAsRead(@Param('id') id: string) {
        return this.notificationsService.markAsRead(+id);
    }

    @Patch('mark-all-read')
    markAllAsRead(@Request() req) {
        const userId = req.user.id;
        return this.notificationsService.markAllAsRead(userId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateNotificationDto: UpdateNotificationDto) {
        return this.notificationsService.update(+id, updateNotificationDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.notificationsService.remove(+id);
    }

    // Trip-specific notification endpoints
    @Post('trip-started')
    createTripStartedNotification(
        @Request() req,
        @Body() body: {
            tripId: string;
            passengerName: string;
            pickupAddress: string;
            dropoffAddress: string;
        },
    ) {
        const userId = req.user.id;
        return this.notificationsService.createTripStartedNotification(
            userId,
            body.tripId,
            body.passengerName,
            body.pickupAddress,
            body.dropoffAddress,
        );
    }

    @Post('trip-completed')
    createTripCompletedNotification(
        @Request() req,
        @Body() body: {
            tripId: string;
            passengerName: string;
            pickupAddress: string;
            dropoffAddress: string;
            finalFare: number;
        },
    ) {
        const userId = req.user.id;
        return this.notificationsService.createTripCompletedNotification(
            userId,
            body.tripId,
            body.passengerName,
            body.pickupAddress,
            body.dropoffAddress,
            body.finalFare,
        );
    }

    @Post('trip-request')
    createTripRequestNotification(
        @Request() req,
        @Body() body: {
            tripId: string;
            passengerName: string;
            pickupAddress: string;
            dropoffAddress: string;
            estimatedFare: number;
        },
    ) {
        const userId = req.user.id;
        return this.notificationsService.createTripRequestNotification(
            userId,
            body.tripId,
            body.passengerName,
            body.pickupAddress,
            body.dropoffAddress,
            body.estimatedFare,
        );
    }
}
