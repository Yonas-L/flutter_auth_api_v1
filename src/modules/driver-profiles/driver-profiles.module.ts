import { Module } from '@nestjs/common';
import { DriverProfilesService } from './driver-profiles.service';
import { DriverProfilesController } from './driver-profiles.controller';
import { DatabaseModule } from '../database/database.module';
import { DriverProfilesPostgresRepository } from '../database/repositories/driver-profiles-postgres.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [DriverProfilesController],
  providers: [DriverProfilesService, DriverProfilesPostgresRepository],
  exports: [DriverProfilesService, DriverProfilesPostgresRepository],
})
export class DriverProfilesModule { }
