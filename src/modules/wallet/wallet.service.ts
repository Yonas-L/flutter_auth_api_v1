import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';
import { DepositRequestDto, WithdrawalRequestDto, TransactionQueryDto } from './dto/wallet.dto';
import { ChapaService, ChapaPaymentRequest } from './chapa.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly postgresService: PostgresService,
    private readonly chapaService: ChapaService,
  ) { }

  async getWalletBalance(userId: string) {
    try {
      // Get or create wallet account
      let walletResult = await this.postgresService.query(
        'SELECT * FROM wallet_accounts WHERE user_id = $1',
        [userId]
      );

      if (walletResult.rows.length === 0) {
        // Create wallet account if it doesn't exist
        await this.postgresService.query(
          `INSERT INTO wallet_accounts (id, user_id, balance_cents, currency, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [uuidv4(), userId, 0, 'ETB']
        );

        walletResult = await this.postgresService.query(
          'SELECT * FROM wallet_accounts WHERE user_id = $1',
          [userId]
        );
      }

      const wallet = walletResult.rows[0];

      return {
        wallet_id: wallet.id,
        balance_cents: wallet.balance_cents,
        balance: wallet.balance_cents / 100,
        currency: wallet.currency,
        last_updated: wallet.updated_at,
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch wallet balance');
    }
  }

  async getTransactions(userId: string, query: TransactionQueryDto) {
    const { page = 1, limit = 20, type } = query;
    const offset = (page - 1) * limit;

    try {
      // Get wallet ID
      const walletResult = await this.postgresService.query(
        'SELECT id FROM wallet_accounts WHERE user_id = $1',
        [userId]
      );

      if (walletResult.rows.length === 0) {
        throw new NotFoundException('Wallet not found');
      }

      const walletId = walletResult.rows[0].id;

      // Build query with optional type filter
      let queryText = `
        SELECT * FROM wallet_transactions 
        WHERE wallet_id = $1
      `;
      const queryParams = [walletId];

      if (type) {
        queryText += ` AND type = $${queryParams.length + 1}`;
        queryParams.push(type);
      }

      queryText += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
      queryParams.push(limit, offset);

      const transactionsResult = await this.postgresService.query(queryText, queryParams);

      // Get total count
      let countQuery = 'SELECT COUNT(*) FROM wallet_transactions WHERE wallet_id = $1';
      const countParams = [walletId];

      if (type) {
        countQuery += ' AND type = $2';
        countParams.push(type);
      }

      const countResult = await this.postgresService.query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);

      return {
        transactions: transactionsResult.rows.map(tx => ({
          ...tx,
          amount: tx.amount_cents / 100,
          balance_after: tx.balance_after_cents / 100,
        })),
        pagination: {
          current_page: page,
          total_pages: Math.ceil(totalCount / limit),
          total_count: totalCount,
          per_page: limit,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException('Failed to fetch transactions');
    }
  }

  async initiateDeposit(userId: string, depositData: DepositRequestDto) {
    try {
      this.logger.log(`Initiating deposit for user ${userId}, amount: ${depositData.amount}`);

      // Get user information for Chapa payment
      const userResult = await this.postgresService.query(
        'SELECT full_name, email, phone_number FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new NotFoundException('User not found');
      }

      const user = userResult.rows[0];
      const [firstName, ...lastNameParts] = (user.full_name || 'User').split(' ');
      const lastName = lastNameParts.join(' ') || '';

      // Get or create wallet
      const wallet = await this.getWalletBalance(userId);

      // Generate unique transaction reference
      const chapaTransactionRef = this.chapaService.generateTransactionRef('ARADA_DEP');

      // Create transaction record
      const transactionId = uuidv4();

      await this.postgresService.query(
        `INSERT INTO wallet_transactions (
          id, wallet_id, type, amount_cents, balance_after_cents,
          description, chapa_tx_ref, chapa_status, payment_method,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          transactionId,
          wallet.wallet_id,
          'deposit',
          Math.round(depositData.amount * 100),
          wallet.balance_cents, // Balance unchanged until payment confirmed
          `Deposit via ${depositData.payment_method}`,
          chapaTransactionRef,
          'pending',
          depositData.payment_method,
        ]
      );

      // Prepare Chapa payment request
      const chapaPaymentData: ChapaPaymentRequest = {
        amount: depositData.amount.toString(),
        currency: 'ETB',
        email: user.email || `${userId}@arada-transport.local`,
        first_name: firstName,
        last_name: lastName,
        phone_number: this.formatPhoneNumberForChapa(user.phone_number || '0912345678'),
        tx_ref: chapaTransactionRef,
        callback_url: `${process.env.BASE_API_URL || 'https://flutter-auth-api-v1.onrender.com'}/api/wallet/deposit/callback`,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/wallet?status=success`,
        customization: {
          title: 'Arada Transport Wallet Deposit',
          description: `Deposit ${depositData.amount} ETB to your wallet`,
        },
      };

      // Initialize payment with Chapa
      const chapaResponse = await this.chapaService.initializePayment(chapaPaymentData);

      this.logger.log(`Chapa payment initialized successfully: ${chapaResponse.data.checkout_url}`);

      return {
        transaction_id: transactionId,
        chapa_tx_ref: chapaTransactionRef,
        chapa_checkout_url: chapaResponse.data.checkout_url,
        amount_cents: Math.round(depositData.amount * 100),
        amount: depositData.amount,
        status: 'pending',
        message: 'Payment initialized successfully. Please complete payment on the next page.',
      };
    } catch (error) {
      this.logger.error(`Failed to initiate deposit: ${error.message}`);
      throw error;
    }
  }

  async submitWithdrawalRequest(userId: string, withdrawalData: WithdrawalRequestDto) {
    return this.postgresService.transaction(async (client) => {
      // Check wallet balance
      const wallet = await this.getWalletBalance(userId);
      const requestAmountCents = Math.round(withdrawalData.amount * 100);

      if (wallet.balance_cents < requestAmountCents) {
        throw new BadRequestException('Insufficient balance');
      }

      // Create withdrawal request
      const requestId = uuidv4();
      await client.query(
        `INSERT INTO withdrawal_requests (
          id, user_id, amount_cents, bank_name, account_number,
          account_holder_name, notes, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          requestId,
          userId,
          requestAmountCents,
          withdrawalData.bank_name,
          withdrawalData.account_number,
          withdrawalData.account_holder_name,
          withdrawalData.notes || null,
          'pending',
        ]
      );

      return {
        request_id: requestId,
        message: 'Withdrawal request submitted successfully. It will be reviewed by an admin.',
      };
    });
  }

  async getUserWithdrawalRequests(userId: string) {
    try {
      const result = await this.postgresService.query(
        `SELECT * FROM withdrawal_requests 
         WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [userId]
      );

      return {
        requests: result.rows.map(req => ({
          ...req,
          amount: req.amount_cents / 100,
        })),
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch withdrawal requests');
    }
  }

  // Handle payment callback from Chapa webhook
  async handlePaymentCallback(chapaTransactionRef: string, status: 'success' | 'failed') {
    try {
      this.logger.log(`Processing payment callback for tx_ref: ${chapaTransactionRef}, status: ${status}`);

      return this.postgresService.transaction(async (client) => {
        // Find transaction with wallet info
        const txResult = await client.query(
          `SELECT wt.*, wa.user_id, wa.balance_cents as current_balance
           FROM wallet_transactions wt
           JOIN wallet_accounts wa ON wt.wallet_id = wa.id
           WHERE wt.chapa_tx_ref = $1 AND wt.type = 'deposit'`,
          [chapaTransactionRef]
        );

        if (txResult.rows.length === 0) {
          this.logger.error(`Transaction not found for tx_ref: ${chapaTransactionRef}`);
          throw new NotFoundException('Transaction not found');
        }

        const transaction = txResult.rows[0];

        // If already processed, don't process again
        if (transaction.chapa_status === 'success' || transaction.chapa_status === 'failed') {
          this.logger.log(`Transaction ${chapaTransactionRef} already processed with status: ${transaction.chapa_status}`);
          return {
            message: 'Transaction already processed',
            chapa_tx_ref: chapaTransactionRef,
            status: transaction.chapa_status
          };
        }

        // Verify payment with Chapa API for additional security
        try {
          const chapaVerification = await this.chapaService.verifyPayment(chapaTransactionRef);
          this.logger.log(`Chapa verification result: ${JSON.stringify(chapaVerification.data)}`);

          // Use Chapa's verification status if available
          if (chapaVerification.data && chapaVerification.data.status) {
            status = chapaVerification.data.status === 'success' ? 'success' : 'failed';
          }
        } catch (error) {
          this.logger.error(`Failed to verify payment with Chapa: ${error.message}`);
          // Continue with webhook status if verification fails
        }

        if (status === 'success') {
          // Update wallet balance
          const newBalance = transaction.current_balance + transaction.amount_cents;

          await client.query(
            'UPDATE wallet_accounts SET balance_cents = $1, updated_at = NOW() WHERE id = $2',
            [newBalance, transaction.wallet_id]
          );

          // Update transaction
          await client.query(
            `UPDATE wallet_transactions 
             SET chapa_status = $1, balance_after_cents = $2, processed_at = NOW(), updated_at = NOW()
             WHERE id = $3`,
            ['success', newBalance, transaction.id]
          );

          this.logger.log(`Wallet balance updated for user ${transaction.user_id}. New balance: ${newBalance} cents`);
        } else {
          // Mark transaction as failed
          await client.query(
            'UPDATE wallet_transactions SET chapa_status = $1, processed_at = NOW(), updated_at = NOW() WHERE id = $2',
            ['failed', transaction.id]
          );
        }

        return {
          success: true,
          message: 'Payment callback processed successfully',
          chapa_tx_ref: chapaTransactionRef,
          status: status,
          wallet_updated: status === 'success'
        };
      });
    } catch (error) {
      this.logger.error(`Failed to process payment callback: ${error.message}`);
      throw error;
    }
  }

  private formatPhoneNumberForChapa(phoneNumber: string): string {
    // Remove any non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // If it starts with 251 (Ethiopia country code), remove it
    if (digits.startsWith('251') && digits.length === 13) {
      return digits.substring(3); // Remove 251 prefix
    }
    
    // If it's already 10 digits, return as is
    if (digits.length === 10) {
      return digits;
    }
    
    // If it's 9 digits, add leading 0
    if (digits.length === 9) {
      return '0' + digits;
    }
    
    // Default fallback
    return '0912345678';
  }
}
