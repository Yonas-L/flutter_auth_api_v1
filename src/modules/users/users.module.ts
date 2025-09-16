import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserStatusSyncService } from './user-status-sync.service';
import { DatabaseModule } from '../database/database.module';
import { DriverProfilesModule } from '../driver-profiles/driver-profiles.module';

@Module({
  imports: [DatabaseModule, DriverProfilesModule],
  controllers: [UsersController],
  providers: [UsersService, UserStatusSyncService],
  exports: [UsersService, UserStatusSyncService],
})
export class UsersModule { }
