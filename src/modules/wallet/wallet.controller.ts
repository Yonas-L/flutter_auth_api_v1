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
  Headers,
} from '@nestjs/common';
import * as crypto from 'crypto';
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

  // Webhook endpoint for Chapa payment callbacks (public endpoint)
  @UseGuards()
  @Post('deposit/callback')
  async handlePaymentCallback(@Body() callbackData: any, @Headers() headers: any) {
    console.log('Payment callback received:', {
      tx_ref: callbackData.tx_ref,
      status: callbackData.status,
      event: callbackData.event,
      headers: headers
    });

    // Chapa webhook sends different data structure
    const chapaTxRef = callbackData.tx_ref || callbackData.chapa_tx_ref;
    const status = callbackData.status === 'success' || callbackData.event === 'charge.success' ? 'success' : 'failed';

    if (!chapaTxRef) {
      throw new BadRequestException('Missing transaction reference');
    }

    return this.walletService.handlePaymentCallback(chapaTxRef, status);
  }

  // Verified webhook endpoint (no auth guard on Chapa webhooks)
  @UseGuards()
  @Post('webhook')
  async handleWebhook(
    @Body() payload: any,
    @Headers('chapa-signature') chapaSignatureA: string,
    @Headers('x-chapa-signature') chapaSignatureB: string,
  ) {
    const secretKey = process.env.CHAPA_SECRET_KEY || '';
    const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET || '';
    if (!secretKey) {
      throw new BadRequestException('Chapa secret key not configured');
    }

    const payloadString = JSON.stringify(payload);
    const expectedSigB = crypto
      .createHmac('sha256', secretKey)
      .update(payloadString)
      .digest('hex');
    const expectedSigA = webhookSecret
      ? crypto.createHmac('sha256', webhookSecret).update(webhookSecret).digest('hex')
      : '';

    const sigBValid = !!chapaSignatureB && chapaSignatureB === expectedSigB;
    const sigAValid = !!webhookSecret && !!chapaSignatureA && chapaSignatureA === expectedSigA;
    if (!sigAValid && !sigBValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const txRef = payload.tx_ref || payload.trx_ref || payload.reference || payload.chapa_tx_ref;
    const status = payload.status === 'success' || payload.event === 'charge.success' ? 'success' : 'failed';
    if (!txRef) {
      throw new BadRequestException('Missing tx_ref in webhook payload');
    }

    const result = await this.walletService.handlePaymentCallback(txRef, status);
    return { ok: true, result };
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

  @Post('debug-deposit')
  async debugDeposit(@Request() req, @Body() depositData: any) {
    try {
      const userId = req.user.id;
      console.log('Debug Deposit - userId:', userId);
      console.log('Debug Deposit - depositData:', depositData);

      // Test the actual deposit process step by step
      const userResult = await this.walletService['postgresService'].query(
        'SELECT full_name, email, phone_number FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];
      console.log('Debug Deposit - user data:', user);

      // Test wallet balance
      const wallet = await this.walletService.getWalletBalance(userId);
      console.log('Debug Deposit - wallet data:', wallet);

      // Test Chapa service initialization
      const chapaService = this.walletService['chapaService'];
      const chapaTransactionRef = chapaService.generateTransactionRef('ARADA_DEP');
      console.log('Debug Deposit - chapaTransactionRef:', chapaTransactionRef);

      return {
        success: true,
        userId: userId,
        user: user,
        wallet: wallet,
        chapaTransactionRef: chapaTransactionRef,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Debug Deposit Error:', error);
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Post('debug-chapa')
  async debugChapa(@Request() req, @Body() depositData: any) {
    try {
      const userId = req.user.id;
      console.log('Debug Chapa - userId:', userId);
      console.log('Debug Chapa - depositData:', depositData);

      // Get user data
      const userResult = await this.walletService['postgresService'].query(
        'SELECT full_name, email, phone_number FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];
      const [firstName, ...lastNameParts] = (user.full_name || 'User').split(' ');
      const lastName = lastNameParts.join(' ') || '';

      // Test Chapa service initialization
      const chapaService = this.walletService['chapaService'];
      const chapaTransactionRef = chapaService.generateTransactionRef('ARADA_DEP');

      // Prepare Chapa payment request
      const chapaPaymentData = {
        amount: depositData.amount.toString(),
        currency: 'ETB',
        email: user.email || `${userId}@arada-transport.local`,
        first_name: firstName,
        last_name: lastName,
        phone_number: user.phone_number || '251900000000',
        tx_ref: chapaTransactionRef,
        callback_url: `${process.env.BASE_API_URL || 'https://flutter-auth-api-v1.onrender.com'}/api/wallet/deposit/callback`,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/wallet?status=success`,
        customization: {
          title: 'Arada Transport Wallet Deposit',
          description: `Deposit ${depositData.amount} ETB to your wallet`,
        },
      };

      console.log('Debug Chapa - payment data:', chapaPaymentData);

      // Try to initialize payment with Chapa
      const chapaResponse = await chapaService.initializePayment(chapaPaymentData);
      console.log('Debug Chapa - response:', chapaResponse);

      return {
        success: true,
        userId: userId,
        user: user,
        chapaTransactionRef: chapaTransactionRef,
        chapaPaymentData: chapaPaymentData,
        chapaResponse: chapaResponse,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Debug Chapa Error:', error);
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
