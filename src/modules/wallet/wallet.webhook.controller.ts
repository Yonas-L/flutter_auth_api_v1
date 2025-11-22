import { Controller, Post, Get, Body, Headers, Query, BadRequestException, Logger } from '@nestjs/common';
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
    paymentReturn(@Query() query: any) {
        const deepLink = 'aradatransport://wallet/payment-complete';

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Payment Complete</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); text-align: center; padding: 20px; }
                    .container { background: white; padding: 48px 40px; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 400px; width: 100%; }
                    .checkmark { width: 80px; height: 80px; margin: 0 auto 24px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
                    .checkmark svg { width: 50px; height: 50px; stroke: white; stroke-width: 3; fill: none; }
                    h1 { color: #1f2937; margin-bottom: 12px; font-size: 28px; }
                    p { color: #6b7280; margin-bottom: 32px; line-height: 1.6; font-size: 16px; }
                    .button { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; display: inline-block; transition: transform 0.2s, box-shadow 0.2s; font-size: 16px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); }
                    .button:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6); }
                    .button:active { transform: translateY(0); }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="checkmark">
                        <svg viewBox="0 0 52 52">
                            <path d="M14 27l7 7 16-16"/>
                        </svg>
                    </div>
                    <h1>Payment Successful!</h1>
                    <p>Your wallet has been credited successfully. Click the button below to return to your wallet.</p>
                    <a href="${deepLink}" class="button">Return to Wallet</a>
                </div>
            </body>
            </html>
        `;
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


