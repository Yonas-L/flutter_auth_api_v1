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

  @Get('debug')
  async debugWallet(@Request() req) {
    try {
      const userId = req.user.id;
      
      // Debug: Check what's in req.user
      console.log('Debug - req.user:', JSON.stringify(req.user, null, 2));
      console.log('Debug - userId from req.user.id:', userId);
      
      // Test database connection
      const userResult = await this.walletService['postgresService'].query(
        'SELECT id, phone_number, full_name FROM users WHERE id = $1',
        [userId]
      );
      
      // Test wallet account
      const walletResult = await this.walletService['postgresService'].query(
        'SELECT * FROM wallet_accounts WHERE user_id = $1',
        [userId]
      );
      
      // Test environment variables
      const envVars = {
        CHAPA_SECRET_KEY: process.env.CHAPA_SECRET_KEY ? 'SET' : 'NOT SET',
        CHAPA_PUBLIC_KEY: process.env.CHAPA_PUBLIC_KEY ? 'SET' : 'NOT SET',
        BASE_API_URL: process.env.BASE_API_URL || 'NOT SET',
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
      };
      
      return {
        success: true,
        reqUser: req.user,
        userId: userId,
        user: userResult.rows[0] || null,
        wallet: walletResult.rows[0] || null,
        environment: envVars,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
