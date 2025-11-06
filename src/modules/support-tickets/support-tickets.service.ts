import { Injectable, Logger, HttpException, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';
import { SocketGateway } from '../socket/socket.gateway';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddResponseDto } from './dto/add-response.dto';

export interface TicketFilters {
    status?: string;
    priority?: string;
    assigned_to_user_id?: string;
    user_id?: string; // For drivers to see only their tickets
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
}

interface CachedAdminList {
    data: any[];
    expiresAt: number;
}

@Injectable()
export class SupportTicketsService {
    private readonly logger = new Logger(SupportTicketsService.name);
    private adminListCache: CachedAdminList | null = null;
    private readonly ADMIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    constructor(
        private readonly postgresService: PostgresService,
        @Inject(forwardRef(() => SocketGateway))
        private readonly socketGateway: SocketGateway,
    ) { }

    /**
     * Create a new support ticket
     */
    async createTicket(userId: string, createTicketDto: CreateTicketDto) {
        try {
            this.logger.log(`Creating ticket for user ${userId}`);

            const {
                subject,
                message,
                category = 'general',
                priority = 'normal',
            } = createTicketDto;

            const query = `
                INSERT INTO support_tickets (
                    user_id,
                    subject,
                    message,
                    status,
                    priority,
                    category,
                    created_at,
                    updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                RETURNING *
            `;

            const result = await this.postgresService.query(query, [
                userId,
                subject,
                message,
                'open',
                priority,
                category,
            ]);

            const ticket = result.rows[0];

            // Emit socket event for real-time updates
            this.socketGateway.broadcastTicketCreated(ticket.id, userId);

            this.logger.log(`Ticket created: ${ticket.id}`);
            return ticket;
        } catch (error) {
            this.logger.error(`Error creating ticket:`, error);
            throw new HttpException(
                'Failed to create ticket',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get tickets with filters and pagination
     */
    async getTickets(filters: TicketFilters = {}) {
        try {
            const {
                status,
                priority,
                assigned_to_user_id,
                user_id,
                category,
                search,
                page = 1,
                limit = 20,
            } = filters;

            const offset = (page - 1) * limit;
            const params: any[] = [];
            let paramCount = 0;

            // Get the current user ID for unread count calculation
            const currentUserId = user_id || filters.user_id;
            
            // Add currentUserId to params first for unread count calculation
            if (currentUserId) {
                paramCount++;
                params.push(currentUserId);
            } else {
                paramCount++;
                params.push('00000000-0000-0000-0000-000000000000');
            }
            
            let query = `
                SELECT 
                    t.id,
                    t.user_id,
                    t.assigned_to_user_id,
                    t.subject,
                    t.message,
                    t.status,
                    t.priority,
                    t.category,
                    t.created_at,
                    t.updated_at,
                    u.full_name as requester_name,
                    u.email as requester_email,
                    u.phone_number as requester_phone,
                    assignee.full_name as assignee_name,
                    assignee.email as assignee_email,
                    (SELECT COUNT(*) FROM ticket_responses WHERE ticket_id = t.id) as response_count,
                    (SELECT MAX(created_at) FROM ticket_responses WHERE ticket_id = t.id) as last_response_at,
                    (SELECT COUNT(*) FROM ticket_responses tr 
                     WHERE tr.ticket_id = t.id 
                     AND tr.is_read = false 
                     AND tr.user_id != $1::uuid) as unread_count
                FROM support_tickets t
                LEFT JOIN users u ON t.user_id = u.id
                LEFT JOIN users assignee ON t.assigned_to_user_id = assignee.id
                WHERE 1=1
            `;

            if (user_id) {
                paramCount++;
                query += ` AND t.user_id = $${paramCount}`;
                params.push(user_id);
            }

            if (status) {
                paramCount++;
                query += ` AND t.status = $${paramCount}`;
                params.push(status);
            }

            if (priority) {
                paramCount++;
                query += ` AND t.priority = $${paramCount}`;
                params.push(priority);
            }

            if (assigned_to_user_id) {
                paramCount++;
                query += ` AND t.assigned_to_user_id = $${paramCount}`;
                params.push(assigned_to_user_id);
            }

            if (category) {
                paramCount++;
                query += ` AND t.category = $${paramCount}`;
                params.push(category);
            }

            if (search) {
                paramCount++;
                query += ` AND (
                    t.subject ILIKE $${paramCount} OR
                    t.message ILIKE $${paramCount} OR
                    u.full_name ILIKE $${paramCount} OR
                    u.email ILIKE $${paramCount}
                )`;
                params.push(`%${search}%`);
            }

            paramCount++;
            query += ` ORDER BY t.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
            params.push(limit, offset);

            const result = await this.postgresService.query(query, params);

            // Get total count for pagination
            let countQuery = `
                SELECT COUNT(*) as total
                FROM support_tickets t
                LEFT JOIN users u ON t.user_id = u.id
                WHERE 1=1
            `;
            const countParams: any[] = [];
            let countParamCount = 0;

            if (user_id) {
                countParamCount++;
                countQuery += ` AND t.user_id = $${countParamCount}`;
                countParams.push(user_id);
            }

            if (status) {
                countParamCount++;
                countQuery += ` AND t.status = $${countParamCount}`;
                countParams.push(status);
            }

            if (priority) {
                countParamCount++;
                countQuery += ` AND t.priority = $${countParamCount}`;
                countParams.push(priority);
            }

            if (assigned_to_user_id) {
                countParamCount++;
                countQuery += ` AND t.assigned_to_user_id = $${countParamCount}`;
                countParams.push(assigned_to_user_id);
            }

            if (category) {
                countParamCount++;
                countQuery += ` AND t.category = $${countParamCount}`;
                countParams.push(category);
            }

            if (search) {
                countParamCount++;
                countQuery += ` AND (
                    t.subject ILIKE $${countParamCount} OR
                    t.message ILIKE $${countParamCount} OR
                    u.full_name ILIKE $${countParamCount} OR
                    u.email ILIKE $${countParamCount}
                )`;
                countParams.push(`%${search}%`);
            }

            const countResult = await this.postgresService.query(countQuery, countParams);
            const total = parseInt(countResult.rows[0]?.total || '0', 10);

            return {
                tickets: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            this.logger.error(`Error fetching tickets:`, error);
            throw new HttpException(
                'Failed to fetch tickets',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get a single ticket with responses
     */
    async getTicketById(ticketId: string, userId?: string) {
        try {
            // Get ticket
            const ticketQuery = `
                SELECT 
                    t.id,
                    t.user_id,
                    t.assigned_to_user_id,
                    t.subject,
                    t.message,
                    t.status,
                    t.priority,
                    t.category,
                    t.created_at,
                    t.updated_at,
                    u.full_name as requester_name,
                    u.email as requester_email,
                    u.phone_number as requester_phone,
                    assignee.full_name as assignee_name,
                    assignee.email as assignee_email
                FROM support_tickets t
                LEFT JOIN users u ON t.user_id = u.id
                LEFT JOIN users assignee ON t.assigned_to_user_id = assignee.id
                WHERE t.id = $1
            `;

            const ticketResult = await this.postgresService.query(ticketQuery, [ticketId]);

            if (ticketResult.rows.length === 0) {
                throw new HttpException('Ticket not found', HttpStatus.NOT_FOUND);
            }

            const ticket = ticketResult.rows[0];

            // Check if user has permission to view this ticket
            if (userId && ticket.user_id !== userId) {
                // Check if user is admin or customer_support
                const userQuery = `SELECT user_type FROM users WHERE id = $1`;
                const userResult = await this.postgresService.query(userQuery, [userId]);
                const userType = userResult.rows[0]?.user_type;

                if (!['admin', 'customer_support', 'super_admin'].includes(userType)) {
                    throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
                }
            }

            // Get responses
            const responsesQuery = `
                SELECT 
                    r.id,
                    r.ticket_id,
                    r.user_id,
                    r.message,
                    r.is_read,
                    r.created_at,
                    u.full_name as user_name,
                    u.email as user_email,
                    u.user_type,
                    COALESCE(dp.avatar_url, u.avatar_url) as user_avatar
                FROM ticket_responses r
                LEFT JOIN users u ON r.user_id = u.id
                LEFT JOIN driver_profiles dp ON u.id = dp.user_id
                WHERE r.ticket_id = $1
                ORDER BY r.created_at ASC
            `;

            const responsesResult = await this.postgresService.query(responsesQuery, [ticketId]);

            // Mark all unread responses from support/admin as read when ticket owner views the ticket
            if (userId && ticket.user_id === userId) {
                const unreadResponseIds = responsesResult.rows
                    .filter((r: any) => !r.is_read && r.user_id !== userId && (r.user_type === 'customer_support' || r.user_type === 'admin' || r.user_type === 'super_admin'))
                    .map((r: any) => r.id);
                
                if (unreadResponseIds.length > 0) {
                    const placeholders = unreadResponseIds.map((_, i) => `$${i + 1}`).join(',');
                    await this.postgresService.query(
                        `UPDATE ticket_responses SET is_read = true WHERE id IN (${placeholders})`,
                        unreadResponseIds
                    );
                    this.logger.log(`✅ Marked ${unreadResponseIds.length} responses as read for ticket ${ticketId}`);
                }
            }

            return {
                ...ticket,
                responses: responsesResult.rows.map((r: any) => ({
                    ...r,
                    // Update is_read status if we just marked them as read
                    is_read: userId && ticket.user_id === userId && r.user_id !== userId && (r.user_type === 'customer_support' || r.user_type === 'admin' || r.user_type === 'super_admin') ? true : r.is_read,
                })),
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

    /**
     * Update a ticket
     */
    async updateTicket(ticketId: string, updateTicketDto: UpdateTicketDto, userId: string) {
        try {
            // Check if ticket exists and user has permission
            const ticket = await this.getTicketById(ticketId, userId);

            // Check if user is admin/customer_support or ticket owner
            const userQuery = `SELECT user_type FROM users WHERE id = $1`;
            const userResult = await this.postgresService.query(userQuery, [userId]);
            const userType = userResult.rows[0]?.user_type;
            const isAdmin = ['admin', 'customer_support', 'super_admin'].includes(userType);
            const isOwner = ticket.user_id === userId;

            if (!isAdmin && !isOwner) {
                throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
            }

            // Only admins can update status and assignment
            if ((updateTicketDto.status || updateTicketDto.assigned_to_user_id) && !isAdmin) {
                throw new HttpException('Only admins can update status and assignment', HttpStatus.FORBIDDEN);
            }

            const updates: string[] = [];
            const params: any[] = [];
            let paramCount = 0;

            if (updateTicketDto.status) {
                paramCount++;
                updates.push(`status = $${paramCount}`);
                params.push(updateTicketDto.status);
            }

            if (updateTicketDto.priority) {
                paramCount++;
                updates.push(`priority = $${paramCount}`);
                params.push(updateTicketDto.priority);
            }

            if (updateTicketDto.assigned_to_user_id !== undefined) {
                paramCount++;
                updates.push(`assigned_to_user_id = $${paramCount}`);
                params.push(updateTicketDto.assigned_to_user_id || null);
            }

            if (updates.length === 0) {
                return ticket;
            }

            paramCount++;
            updates.push(`updated_at = NOW()`);
            params.push(ticketId);

            const query = `
                UPDATE support_tickets
                SET ${updates.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *
            `;

            const result = await this.postgresService.query(query, params);
            const updatedTicket = result.rows[0];

            // Emit socket events
            this.socketGateway.broadcastTicketUpdated(ticketId, updateTicketDto);

            if (updateTicketDto.assigned_to_user_id) {
                this.socketGateway.broadcastTicketAssigned(ticketId, updateTicketDto.assigned_to_user_id);
            }

            return updatedTicket;
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

    /**
     * Add a response to a ticket
     */
    async addResponse(ticketId: string, userId: string, addResponseDto: AddResponseDto) {
        try {
            // Verify ticket exists
            const ticket = await this.getTicketById(ticketId, userId);

            // Insert response
            const responseQuery = `
                INSERT INTO ticket_responses (
                    ticket_id,
                    user_id,
                    message,
                    is_read,
                    created_at
                ) VALUES ($1, $2, $3, false, NOW())
                RETURNING *
            `;

            const responseResult = await this.postgresService.query(responseQuery, [
                ticketId,
                userId,
                addResponseDto.message,
            ]);

            const response = responseResult.rows[0];

            // Update ticket's updated_at
            await this.postgresService.query(
                `UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`,
                [ticketId]
            );

            // Get user info for response
            const userQuery = `SELECT full_name, email, user_type FROM users WHERE id = $1`;
            const userResult = await this.postgresService.query(userQuery, [userId]);
            const user = userResult.rows[0];

            // Emit socket event
            this.socketGateway.broadcastTicketResponseAdded(
                ticketId,
                response.id,
                userId,
                addResponseDto.message,
                new Date(),
            );

            // Mark as read if the response is from the ticket owner viewing their own ticket
            // (They just responded, so they've seen it)
            if (ticket.user_id === userId) {
                await this.postgresService.query(
                    `UPDATE ticket_responses SET is_read = true WHERE id = $1`,
                    [response.id]
                );
            }

            return {
                ...response,
                user_name: user?.full_name,
                user_email: user?.email,
                user_type: user?.user_type,
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

    /**
     * Get list of admin users for assignment (with caching)
     */
    async getAdminUsers() {
        try {
            // Check cache first
            if (this.adminListCache && this.adminListCache.expiresAt > Date.now()) {
                this.logger.debug('Returning cached admin list');
                return this.adminListCache.data;
            }

            // Fetch from database
            const query = `
                SELECT 
                    id,
                    full_name,
                    email,
                    user_type
                FROM users
                WHERE user_type IN ('admin', 'customer_support', 'super_admin')
                AND is_active = true
                ORDER BY full_name ASC
            `;

            const result = await this.postgresService.query(query);
            const adminList = result.rows;

            // Update cache
            this.adminListCache = {
                data: adminList,
                expiresAt: Date.now() + this.ADMIN_CACHE_TTL,
            };

            this.logger.debug(`Cached admin list (${adminList.length} admins) for ${this.ADMIN_CACHE_TTL / 1000}s`);
            return adminList;
        } catch (error) {
            this.logger.error(`Error fetching admin users:`, error);
            throw new HttpException(
                'Failed to fetch admin users',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Get unread response count for a user
     */
    async getUnreadCount(userId: string) {
        try {
            const query = `
                SELECT COUNT(*) as unread_count
                FROM ticket_responses tr
                INNER JOIN support_tickets t ON tr.ticket_id = t.id
                WHERE t.user_id = $1
                AND tr.is_read = false
                AND tr.user_id != $1
            `;

            const result = await this.postgresService.query(query, [userId]);
            return parseInt(result.rows[0]?.unread_count || '0', 10);
        } catch (error) {
            this.logger.error(`Error fetching unread count:`, error);
            return 0;
        }
    }
}

