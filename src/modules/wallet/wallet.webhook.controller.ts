import { Controller, Post, Get, Body, Headers, Query, BadRequestException, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import * as crypto from 'crypto';
import { WalletService } from './wallet.service';

@Controller('api/wallet')
export class WalletWebhookController {
    private readonly logger = new Logger(WalletWebhookController.name);

    constructor(private readonly walletService: WalletService) { }

    @Get('webhook/test')
    @Public()
    ping() {
        return { ok: true, message: 'Webhook endpoint reachable' };
    }

    @Get('payment-return')
    @Public()
    paymentReturn(@Query() query: any, @Res() res: Response) {
        const deepLink = 'aradatransport://wallet/payment-complete';

        return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Successful</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              background: white;
              border-radius: 20px;
              padding: 40px;
              text-align: center;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              max-width: 400px;
            }
            .checkmark {
              width: 80px;
              height: 80px;
              border-radius: 50%;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 20px;
              animation: scaleIn 0.5s ease-out;
            }
            .checkmark svg {
              width: 50px;
              height: 50px;
              stroke: white;
              stroke-width: 3;
              fill: none;
              stroke-linecap: round;
              stroke-linejoin: round;
              animation: drawCheck 0.5s ease-out 0.3s forwards;
              stroke-dasharray: 100;
              stroke-dashoffset: 100;
            }
            @keyframes scaleIn {
              from { transform: scale(0); }
              to { transform: scale(1); }
            }
            @keyframes drawCheck {
              to { stroke-dashoffset: 0; }
            }
            h1 {
              color: #333;
              margin: 0 0 10px;
              font-size: 28px;
            }
            p {
              color: #666;
              margin: 0 0 20px;
              font-size: 16px;
            }
            .redirect-message {
              color: #999;
              font-size: 14px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="checkmark">
              <svg viewBox="0 0 52 52">
                <polyline points="14 27 22 35 38 19"/>
              </svg>
            </div>
            <h1>Payment Successful!</h1>
            <p>Your deposit has been processed successfully.</p>
            <p class="redirect-message">Redirecting you back to the app...</p>
          </div>
          <script>
            // Automatically redirect to the app after a short delay
            setTimeout(function() {
              window.location.href = 'aradatransport://wallet/payment-complete';
            }, 2000);
          </script>
        </body>
      </html>
    `);
    }

    @Post('webhook')
    @Public()
    async handleWebhook(
        @Body() payload: any,
        @Headers('chapa-signature') chapaSignature: string,
        @Headers('x-chapa-signature') xChapaSignature: string,
    ) {
        // Webhook secret hash configured in Chapa dashboard
        const webhookSecret = process.env.CHAPA_SECRET_KEY || '';
        if (!webhookSecret) {
            this.logger.error('Chapa secret key not configured');
            throw new BadRequestException('Chapa secret key not configured');
        }

        this.logger.log('Webhook received:', {
            event: payload.event,
            tx_ref: payload.tx_ref,
            status: payload.status,
            amount: payload.amount,
            chapaSignature,
            xChapaSignature
        });

        // Verify webhook signature according to Chapa documentation
        // x-chapa-signature: HMAC SHA256(payload, secret)
        const payloadString = JSON.stringify(payload);
        const expectedXChapaSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(payloadString)
            .digest('hex');

        // chapa-signature: HMAC SHA256(secret, secret)
        const expectedChapaSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(webhookSecret)
            .digest('hex');

        // Verify either signature is valid (Chapa sends both)
        const xChapaValid = !!xChapaSignature && xChapaSignature === expectedXChapaSignature;
        const chapaValid = !!chapaSignature && chapaSignature === expectedChapaSignature;

        this.logger.log('Signature validation:', {
            xChapaValid,
            chapaValid,
            expectedXChapaSignature,
            expectedChapaSignature,
            receivedXChapaSignature: xChapaSignature,
            receivedChapaSignature: chapaSignature
        });

        if (!xChapaValid && !chapaValid) {
            this.logger.error('Invalid webhook signature - rejecting webhook');
            throw new BadRequestException('Invalid webhook signature');
        }

        const txRef = payload.tx_ref || payload.trx_ref || payload.reference || payload.chapa_tx_ref;
        const status = payload.status === 'success' || payload.event === 'charge.success' ? 'success' : 'failed';
        if (!txRef) {
            this.logger.error('Missing tx_ref in webhook payload');
            throw new BadRequestException('Missing tx_ref in webhook payload');
        }

        this.logger.log(`Processing payment callback for tx_ref: ${txRef}, status: ${status}`);
        const result = await this.walletService.handlePaymentCallback(txRef, status as 'success' | 'failed');

        this.logger.log(`Webhook processed successfully for tx_ref: ${txRef}`);
        return { ok: true, result };
    }
}


