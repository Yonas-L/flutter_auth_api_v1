import { Module } from '@nestjs/common';
import { DriverProfilesService } from './driver-profiles.service';
import { DriverProfilesController } from './driver-profiles.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthPostgresModule } from '../auth/auth-postgres.module';

@Module({
  imports: [DatabaseModule, AuthPostgresModule],
  controllers: [DriverProfilesController],
  providers: [DriverProfilesService],
  exports: [DriverProfilesService],
})
export class DriverProfilesModule {}
