import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { WalletWebhookController } from './wallet.webhook.controller';
import { ChapaService } from './chapa.service';
import { PostgresService } from '../database/postgres.service';

@Module({
  controllers: [WalletController, WalletWebhookController],
  providers: [WalletService, ChapaService, PostgresService],
  exports: [WalletService, ChapaService],
})
export class WalletModule { }
