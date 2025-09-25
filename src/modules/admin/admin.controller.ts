import { Controller, Post, Body, Get, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('admin')
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    @Post('users')
    @UseGuards(JwtAuthGuard)
    async createUser(
        @CurrentUser() user: any,
        @Body() createUserDto: { email: string; full_name: string; user_type: 'admin' | 'customer_support' },
    ) {
        // Check if user has super_admin role
        if (!user.roles?.includes('super_admin')) {
            throw new Error('Insufficient permissions. Super admin role required.');
        }

        return this.adminService.createUser(
            createUserDto.email,
            createUserDto.full_name,
            createUserDto.user_type,
        );
    }

    @Post('users/change-password')
    async changePassword(
        @Body() changePasswordDto: { email: string; temp_password: string; new_password: string },
    ) {
        return this.adminService.changePassword(
            changePasswordDto.email,
            changePasswordDto.temp_password,
            changePasswordDto.new_password,
        );
    }

    @Get('users')
    @UseGuards(JwtAuthGuard)
    async getUsers(
        @CurrentUser() user: any,
        @Query('page') page: string = '1',
        @Query('limit') limit: string = '10',
        @Query('user_type') userType?: string,
    ) {
        // Check if user has admin or super_admin role
        if (!user.roles?.includes('super_admin') && !user.roles?.includes('admin')) {
            throw new Error('Insufficient permissions. Admin role required.');
        }

        // This would need to be implemented in the service
        return { message: 'Get users endpoint - to be implemented' };
    }
}
