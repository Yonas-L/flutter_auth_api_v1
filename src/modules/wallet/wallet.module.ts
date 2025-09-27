import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { ChapaService } from './chapa.service';
import { PostgresService } from '../database/postgres.service';

@Module({
  controllers: [WalletController],
  providers: [WalletService, ChapaService, PostgresService],
  exports: [WalletService, ChapaService],
})
export class WalletModule { }
