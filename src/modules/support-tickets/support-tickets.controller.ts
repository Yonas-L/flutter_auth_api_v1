import {
    Controller,
    Get,
    Post,
    Put,
    Param,
    Body,
    Query,
    UseGuards,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupportTicketsService } from './support-tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddResponseDto } from './dto/add-response.dto';
import type { User } from '../database/entities/user.entity';

@Controller('api/support-tickets')
@UseGuards(JwtAuthGuard)
export class SupportTicketsController {
    private readonly logger = new Logger(SupportTicketsController.name);

    constructor(private readonly supportTicketsService: SupportTicketsService) { }

    @Post()
    async createTicket(
        @CurrentUser() user: User,
        @Body() createTicketDto: CreateTicketDto,
    ) {
        try {
            const ticket = await this.supportTicketsService.createTicket(
                user.id,
                createTicketDto,
            );

            return {
                success: true,
                ticket,
                message: 'Ticket created successfully',
            };
        } catch (error) {
            this.logger.error(`Error creating ticket:`, error);
            throw new HttpException(
                'Failed to create ticket',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get()
    async getTickets(
        @CurrentUser() user: User,
        @Query('status') status?: string,
        @Query('priority') priority?: string,
        @Query('assigned_to_user_id') assigned_to_user_id?: string,
        @Query('category') category?: string,
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        try {
            const userType: any = (user as any)?.user_type ?? (user as any)?.userType;
            const isAdmin = ['admin', 'customer_support', 'super_admin'].includes(userType);

            const filters: any = {
                status,
                priority,
                assigned_to_user_id,
                category,
                search,
                page: page ? parseInt(page, 10) : 1,
                limit: limit ? parseInt(limit, 10) : 20,
            };

            // Drivers can only see their own tickets
            if (!isAdmin) {
                filters.user_id = user.id;
            }

            // Pass user type for unread count calculation
            filters.is_support_user = isAdmin;

            const result = await this.supportTicketsService.getTickets(filters);

            return {
                success: true,
                ...result,
            };
        } catch (error) {
            this.logger.error(`Error fetching tickets:`, error);
            throw new HttpException(
                'Failed to fetch tickets',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get('admins')
    async getAdminUsers(@CurrentUser() user: User) {
        try {
            const userType: any = (user as any)?.user_type ?? (user as any)?.userType;
            const isAdmin = ['admin', 'customer_support', 'super_admin'].includes(userType);

            if (!isAdmin) {
                throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
            }

            const admins = await this.supportTicketsService.getAdminUsers();

            return {
                success: true,
                admins,
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            this.logger.error(`Error fetching admin users:`, error);
            throw new HttpException(
                'Failed to fetch admin users',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Get('unread-count')
    async getUnreadCount(@CurrentUser() user: User) {
        try {
            const count = await this.supportTicketsService.getUnreadCount(user.id);

            return {
                success: true,
                unread_count: count,
            };
        } catch (error) {
            this.logger.error(`Error fetching unread count:`, error);
            return {
                success: true,
                unread_count: 0,
            };
        }
    }

    @Get(':id')
    async getTicketById(
        @Param('id') ticketId: string,
        @CurrentUser() user: User,
    ) {
        try {
            const ticket = await this.supportTicketsService.getTicketById(ticketId, user.id);

            return {
                success: true,
                ticket,
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            this.logger.error(`Error fetching ticket:`, error);
            throw new HttpException(
                'Failed to fetch ticket',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Put(':id')
    async updateTicket(
        @Param('id') ticketId: string,
        @CurrentUser() user: User,
        @Body() updateTicketDto: UpdateTicketDto,
    ) {
        try {
            const ticket = await this.supportTicketsService.updateTicket(
                ticketId,
                updateTicketDto,
                user.id,
            );

            return {
                success: true,
                ticket,
                message: 'Ticket updated successfully',
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            this.logger.error(`Error updating ticket:`, error);
            throw new HttpException(
                'Failed to update ticket',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    @Post(':id/responses')
    async addResponse(
        @Param('id') ticketId: string,
        @CurrentUser() user: User,
        @Body() addResponseDto: AddResponseDto,
    ) {
        try {
            const response = await this.supportTicketsService.addResponse(
                ticketId,
                user.id,
                addResponseDto,
            );

            return {
                success: true,
                response,
                message: 'Response added successfully',
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            this.logger.error(`Error adding response:`, error);
            throw new HttpException(
                'Failed to add response',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}

