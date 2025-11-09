import { Module, forwardRef } from '@nestjs/common';
import { DriverProfilesService } from './driver-profiles.service';
import { DriverProfilesController } from './driver-profiles.controller';
import { DatabaseModule } from '../database/database.module';
import { DriverProfilesPostgresRepository } from '../database/repositories/driver-profiles-postgres.repository';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => WalletModule), // Use forwardRef to resolve circular dependency with WalletModule
  ],
  controllers: [DriverProfilesController],
  providers: [DriverProfilesService, DriverProfilesPostgresRepository],
  exports: [DriverProfilesService, DriverProfilesPostgresRepository],
})
export class DriverProfilesModule { }
