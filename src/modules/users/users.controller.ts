import {
    Controller,
    Get,
    Post,
    Put,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
    HttpStatus,
    HttpException,
    Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto, RegistrationProgressDto } from './dto/user-response.dto';
import { DriverProfilesService } from '../driver-profiles/driver-profiles.service';

@Controller('api/users')
export class UsersController {
    private readonly logger = new Logger(UsersController.name);

    constructor(
        private readonly usersService: UsersService,
        private readonly driverProfilesService: DriverProfilesService,
    ) { }

    /**
     * Debug endpoint to list all users (temporary)
     */
    @Get('debug/all')
    async getAllUsers() {
        try {
            const users = await this.usersService.findAll();
            return users;
        } catch (error) {
            this.logger.error('Error getting all users:', error);
            throw error;
        }
    }

    /**
     * Debug endpoint to test phone number lookup
     */
    @Get('debug/phone/:phone')
    async debugPhoneLookup(@Param('phone') phone: string) {
        try {
            this.logger.log(`🔍 Debug: Looking up phone: ${phone}`);
            const user = await this.usersService.findByPhone(phone);
            this.logger.log(`🔍 Debug: Found user: ${user ? user.id : 'null'}`);
            return {
                phone,
                found: !!user,
                user: user ? { id: user.id, phone_number: user.phone_number } : null
            };
        } catch (error) {
            this.logger.error('Error in phone lookup debug:', error);
            throw error;
        }
    }

    /**
     * Get current user profile (requires authentication)
     */
    @Get('profile')
    @UseGuards(AuthGuard('jwt'))
    async getCurrentUserProfile(@Request() req: any): Promise<UserResponseDto> {
        try {
            const userId = req.user.id;
            const user = await this.usersService.findById(userId);

            if (!user) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }

            return new UserResponseDto(user);
        } catch (error) {
            this.logger.error('Error getting user profile:', error);
            throw error;
        }
    }

    /**
     * Get current user status (requires authentication)
     */
    @Get('status')
    @UseGuards(AuthGuard('jwt'))
    async getUserStatus(@Request() req: any): Promise<{ status: string; message: string }> {
        try {
            const userId = req.user.id;
            const user = await this.usersService.findById(userId);

            if (!user) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }

            this.logger.log(`🔍 User status for ${userId}: ${user.status}`);

            let message = '';
            switch (user.status) {
                case 'pending_verification':
                    message = 'Your account is under review. We\'ll notify you once verification is complete.';
                    break;
                case 'verified':
                    message = 'Your account is verified! You can now start accepting rides.';
                    break;
                case 'active':
                    message = 'Your account is active and ready to use.';
                    break;
                case 'suspended':
                    message = 'Your account has been suspended. Please contact support for assistance.';
                    break;
                case 'deleted':
                    message = 'Your account has been deleted. Please contact support for assistance.';
                    break;
                default:
                    message = 'Your account status is being processed.';
            }

            return {
                status: user.status,
                message: message
            };
        } catch (error) {
            this.logger.error('Error getting user status:', error);
            throw error;
        }
    }

    /**
     * Update current user profile (requires authentication)
     */
    @Put('profile')
    @UseGuards(AuthGuard('jwt'))
    async updateCurrentUserProfile(
        @Request() req: any,
        @Body() updateUserDto: UpdateUserDto,
    ): Promise<UserResponseDto> {
        try {
            const userId = req.user.id;
            const updatedUser = await this.usersService.updateById(userId, updateUserDto);

            if (!updatedUser) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }

            return new UserResponseDto(updatedUser);
        } catch (error) {
            this.logger.error('Error updating user profile:', error);
            throw error;
        }
    }

    /**
     * Create a new user (admin or system use)
     */
    @Post()
    async createUser(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
        try {
            const user = await this.usersService.create(createUserDto);
            return new UserResponseDto(user);
        } catch (error) {
            this.logger.error('Error creating user:', error);
            if (error.message.includes('duplicate') || error.message.includes('unique')) {
                throw new HttpException('User already exists', HttpStatus.CONFLICT);
            }
            throw new HttpException('Failed to create user', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Test endpoint to verify backend is working
     */
    @Get('test')
    async testEndpoint(): Promise<{ message: string; timestamp: string }> {
        this.logger.log('🔍 Test endpoint called');
        return {
            message: 'Backend is working',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get user by ID (admin use)
     */
    @Get(':id')
    async getUserById(@Param('id') id: string): Promise<UserResponseDto> {
        try {
            const user = await this.usersService.findById(id);

            if (!user) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }

            return new UserResponseDto(user);
        } catch (error) {
            this.logger.error(`Error getting user ${id}:`, error);
            throw error;
        }
    }

    /**
     * Find user by phone number
     */
    @Get('phone/:phoneNumber')
    async getUserByPhone(@Param('phoneNumber') phoneNumber: string): Promise<UserResponseDto> {
        try {
            // Normalize phone number
            const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

            const user = await this.usersService.findByPhone(normalizedPhone);

            if (!user) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }

            return new UserResponseDto(user);
        } catch (error) {
            this.logger.error(`Error getting user by phone ${phoneNumber}:`, error);
            throw error;
        }
    }

    /**
     * Find user by email
     */
    @Get('email/:email')
    async getUserByEmail(@Param('email') email: string): Promise<UserResponseDto> {
        try {
            const user = await this.usersService.findByEmail(email);

            if (!user) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }

            return new UserResponseDto(user);
        } catch (error) {
            this.logger.error(`Error getting user by email ${email}:`, error);
            throw error;
        }
    }

    /**
     * Check if phone number is registered
     */
    @Get('check/phone/:phoneNumber')
    async checkPhoneRegistration(@Param('phoneNumber') phoneNumber: string): Promise<{ exists: boolean }> {
        try {
            // Normalize phone number
            const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

            const exists = await this.usersService.isPhoneRegistered(normalizedPhone);
            return { exists };
        } catch (error) {
            this.logger.error(`Error checking phone registration ${phoneNumber}:`, error);
            throw new HttpException('Failed to check phone registration', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
 * Get registration progress for current user
 */
    @Get('registration/progress')
    @UseGuards(AuthGuard('jwt'))
    async getRegistrationProgress(@Request() req: any): Promise<RegistrationProgressDto> {
        try {
            const userId = req.user.id;
            this.logger.log(`🔍 Getting registration progress for user: ${userId}`);

            // Get driver-specific registration progress
            this.logger.log(`🔍 Calling driverProfilesService.getRegistrationProgress for user: ${userId}`);
            const driverProgress = await this.driverProfilesService.getRegistrationProgress(userId);
            this.logger.log(`🔍 Driver progress response: ${JSON.stringify(driverProgress)}`);

            // Convert to generic registration progress format
            return new RegistrationProgressDto({
                hasProfile: driverProgress.hasProfile,
                hasVehicle: driverProgress.hasVehicle,
                isComplete: driverProgress.isComplete,
                verificationStatus: driverProgress.verificationStatus,
                nextStep: driverProgress.nextStep,
            });
        } catch (error) {
            this.logger.error('Error getting registration progress:', error);
            throw new HttpException('Failed to get registration progress', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }


    /**
     * Update user's last login timestamp
     */
    @Post(':id/login')
    async updateLastLogin(@Param('id') id: string): Promise<{ success: boolean }> {
        try {
            await this.usersService.updateLastLogin(id);
            return { success: true };
        } catch (error) {
            this.logger.error(`Error updating last login for user ${id}:`, error);
            throw new HttpException('Failed to update last login', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Create or update user (upsert operation)
     */
    @Post('upsert')
    async upsertUser(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
        try {
            this.logger.log(`Attempting to upsert user: ${JSON.stringify(createUserDto)}`);
            const user = await this.usersService.upsertUser(createUserDto);
            this.logger.log(`User upserted successfully: ${user.id}`);
            return new UserResponseDto(user);
        } catch (error) {
            this.logger.error('Error upserting user:', error);
            this.logger.error('Error details:', {
                message: error.message,
                stack: error.stack,
                userData: createUserDto,
            });

            // Provide more specific error messages
            if (error.message?.includes('duplicate key') || error.code === '23505') {
                throw new HttpException('User already exists with this phone or email', HttpStatus.CONFLICT);
            } else if (error.message?.includes('RLS') || error.message?.includes('policy')) {
                throw new HttpException('Database access denied - check RLS policies', HttpStatus.FORBIDDEN);
            } else if (error.message?.includes('connection') || error.code === 'PGRST301') {
                throw new HttpException('Database connection error', HttpStatus.SERVICE_UNAVAILABLE);
            } else {
                throw new HttpException(`Failed to upsert user: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
    }
}
