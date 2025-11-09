import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocketGateway } from '../socket/socket.gateway';

@Controller('admin/driver-flags')
export class DriverFlagsController {
    constructor(private socketGateway: SocketGateway) {}

    @Post('broadcast-flag')
    @UseGuards(JwtAuthGuard)
    async broadcastFlag(@Body() flagData: {
        flagId: string;
        driverId: string;
        driverName: string;
        flagReason: string;
        priority: string;
        reporterName?: string;
        assignedToAdminId?: string;
    }) {
        this.socketGateway.broadcastDriverFlagCreated(flagData);
        return { success: true, message: flagData.assignedToAdminId ? 'Flag broadcasted to assigned admin' : 'Flag broadcasted to admins' };
    }

    @Post('broadcast-deactivation')
    @UseGuards(JwtAuthGuard)
    async broadcastDeactivation(@Body() driverData: {
        driverId: string;
        driverUserId: string;
        driverName: string;
        driverPhone?: string;
        deactivationReason: string;
        deactivatedBy?: string;
        deactivationId?: string;
        flagId?: string;
    }) {
        this.socketGateway.broadcastDriverDeactivated(driverData);
        return { success: true, message: 'Deactivation broadcasted' };
    }
}

