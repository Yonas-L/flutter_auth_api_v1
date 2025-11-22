import { Controller, Post, Get, Body, Headers, BadRequestException, Logger } from '@nestjs/common';
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


