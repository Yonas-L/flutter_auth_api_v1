import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Use Supabase JWT secret for verifying Supabase tokens
      secretOrKey: configService.get('SUPABASE_JWT_SECRET') || configService.get('JWT_ACCESS_SECRET') || 'fallback-secret',
    });
  }

  async validate(payload: any) {
    // Handle both Supabase JWT format and custom JWT format
    const userId = payload.sub || payload.id;

    if (!userId) {
      throw new UnauthorizedException('Invalid token: missing user ID');
    }

    // Try to find user in our database
    let user = await this.usersService.findById(userId);

    // If user doesn't exist but we have a valid Supabase token, create user record
    if (!user && payload.phone && payload.email) {
      try {
        user = await this.usersService.create({
          id: userId,
          phone_number: payload.phone.startsWith('+') ? payload.phone : `+${payload.phone}`,
          email: payload.email,
          full_name: payload.user_metadata?.display_name || null,
          user_type: 'passenger',
          is_active: true,
          is_phone_verified: true, // If they have a valid Supabase token, phone is verified
          is_email_verified: payload.email_confirmed_at ? true : false,
          status: 'pending_verification', // Default status for new users
        });
      } catch (error) {
        // If user creation fails, they might already exist with a different format
        console.log('Failed to create user, trying to find existing:', error);
        user = await this.usersService.findByPhone(payload.phone.startsWith('+') ? payload.phone : `+${payload.phone}`);
      }
    }

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Return in format expected by existing auth guards
    return {
      id: user.id,
      email: user.email,
      phoneNumber: user.phone_number,
      name: user.full_name,
      role: 'driver', // Default for now
      status: user.status,
    };
  }
}
