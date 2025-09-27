import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { PostgresService } from '../database/postgres.service';

@Module({
  controllers: [WalletController],
  providers: [WalletService, PostgresService],
  exports: [WalletService],
})
export class WalletModule {}
