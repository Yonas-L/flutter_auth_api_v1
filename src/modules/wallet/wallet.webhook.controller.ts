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
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f5f5f5; text-align: center; padding: 20px; }
                    .container { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 400px; width: 100%; }
                    h1 { color: #10b981; margin-bottom: 16px; }
                    p { color: #6b7280; margin-bottom: 24px; line-height: 1.5; }
                    .button { background-color: #000; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block; transition: opacity 0.2s; }
                    .button:hover { opacity: 0.9; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Payment Successful!</h1>
                    <p>Your deposit has been processed. Redirecting you back to the app...</p>
                    <a href="${deepLink}" class="button">Open App</a>
                </div>
                <script>
                    setTimeout(function() {
                        window.location.href = "${deepLink}";
                    }, 1000);
                </script>
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


