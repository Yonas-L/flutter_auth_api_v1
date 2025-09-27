import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { DepositRequestDto, WithdrawalRequestDto, TransactionQueryDto } from './dto/wallet.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) { }

  @Get('balance')
  async getBalance(@Request() req) {
    return this.walletService.getWalletBalance(req.user.id);
  }

  @Get('transactions')
  async getTransactions(
    @Request() req,
    @Query(ValidationPipe) query: TransactionQueryDto,
  ) {
    return this.walletService.getTransactions(req.user.id, query);
  }

  @Post('deposit')
  async initiateDeposit(
    @Request() req,
    @Body(ValidationPipe) depositData: DepositRequestDto,
  ) {
    return this.walletService.initiateDeposit(req.user.id, depositData);
  }

  @Post('withdraw')
  async submitWithdrawalRequest(
    @Request() req,
    @Body(ValidationPipe) withdrawalData: WithdrawalRequestDto,
  ) {
    return this.walletService.submitWithdrawalRequest(req.user.id, withdrawalData);
  }

  @Get('withdraw')
  async getWithdrawalRequests(@Request() req) {
    return this.walletService.getUserWithdrawalRequests(req.user.id);
  }

  // Webhook endpoint for Chapa payment callbacks
  @Post('deposit/callback')
  async handlePaymentCallback(@Body() callbackData: any) {
    // Chapa webhook sends different data structure
    const chapaTxRef = callbackData.tx_ref || callbackData.chapa_tx_ref;
    const status = callbackData.status === 'success' ? 'success' : 'failed';

    if (!chapaTxRef) {
      throw new BadRequestException('Missing transaction reference');
    }

    return this.walletService.handlePaymentCallback(chapaTxRef, status);
  }
}
