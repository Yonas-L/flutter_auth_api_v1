import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PostgresService } from '../database/postgres.service';
import { DepositRequestDto, WithdrawalRequestDto, TransactionQueryDto } from './dto/wallet.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WalletService {
  constructor(private readonly postgresService: PostgresService) {}

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
    return this.postgresService.transaction(async (client) => {
      // Get or create wallet
      const wallet = await this.getWalletBalance(userId);
      
      // Create transaction record
      const transactionId = uuidv4();
      const chapaTransactionRef = `CHAPA_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await client.query(
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

      // In a real implementation, integrate with Chapa API here
      const chapaCheckoutUrl = `https://api.chapa.co/v1/checkout/${chapaTransactionRef}`;

      return {
        transaction_id: transactionId,
        chapa_tx_ref: chapaTransactionRef,
        chapa_checkout_url: chapaCheckoutUrl,
        amount_cents: Math.round(depositData.amount * 100),
        amount: depositData.amount,
      };
    });
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

  // Simulate payment callback (in real implementation, this would be called by Chapa webhook)
  async handlePaymentCallback(chapaTransactionRef: string, status: 'success' | 'failed') {
    return this.postgresService.transaction(async (client) => {
      // Find transaction
      const txResult = await client.query(
        'SELECT * FROM wallet_transactions WHERE chapa_tx_ref = $1',
        [chapaTransactionRef]
      );

      if (txResult.rows.length === 0) {
        throw new NotFoundException('Transaction not found');
      }

      const transaction = txResult.rows[0];

      if (status === 'success') {
        // Update wallet balance
        await client.query(
          'UPDATE wallet_accounts SET balance_cents = balance_cents + $1, updated_at = NOW() WHERE id = $2',
          [transaction.amount_cents, transaction.wallet_id]
        );

        // Get new balance
        const balanceResult = await client.query(
          'SELECT balance_cents FROM wallet_accounts WHERE id = $1',
          [transaction.wallet_id]
        );
        const newBalance = balanceResult.rows[0].balance_cents;

        // Update transaction
        await client.query(
          `UPDATE wallet_transactions 
           SET chapa_status = $1, balance_after_cents = $2, processed_at = NOW() 
           WHERE id = $3`,
          ['success', newBalance, transaction.id]
        );
      } else {
        // Mark transaction as failed
        await client.query(
          'UPDATE wallet_transactions SET chapa_status = $1, processed_at = NOW() WHERE id = $2',
          ['failed', transaction.id]
        );
      }

      return { success: true };
    });
  }
}
