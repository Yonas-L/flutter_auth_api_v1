import { Controller, Post, Get, Body, Headers, BadRequestException, SetMetadata } from '@nestjs/common';
import * as crypto from 'crypto';
import { WalletService } from './wallet.service';

@Controller('api/wallet')
export class WalletWebhookController {
    constructor(private readonly walletService: WalletService) { }

    @Get('webhook/test')
    @SetMetadata('isPublic', true)
    ping() {
        return { ok: true, message: 'Webhook endpoint reachable' };
    }

    @Post('webhook')
    @SetMetadata('isPublic', true)
    async handleWebhook(
        @Body() payload: any,
        @Headers('chapa-signature') chapaSignature: string,
        @Headers('x-chapa-signature') xChapaSignature: string,
    ) {
        // Webhook secret hash configured in Chapa dashboard
        const webhookSecret = process.env.CHAPA_SECRET_KEY || '';
        if (!webhookSecret) {
            throw new BadRequestException('Chapa secret key not configured');
        }

        console.log('Webhook received:', {
            event: payload.event,
            tx_ref: payload.tx_ref,
            status: payload.status,
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
        
        console.log('Signature validation:', {
            xChapaValid,
            chapaValid,
            expectedXChapaSignature,
            expectedChapaSignature,
            receivedXChapaSignature: xChapaSignature,
            receivedChapaSignature: chapaSignature
        });

        if (!xChapaValid && !chapaValid) {
            console.error('Invalid webhook signature');
            throw new BadRequestException('Invalid webhook signature');
        }

        const txRef = payload.tx_ref || payload.trx_ref || payload.reference || payload.chapa_tx_ref;
        const status = payload.status === 'success' || payload.event === 'charge.success' ? 'success' : 'failed';
        if (!txRef) {
            throw new BadRequestException('Missing tx_ref in webhook payload');
        }

        const result = await this.walletService.handlePaymentCallback(txRef, status as 'success' | 'failed');
        return { ok: true, result };
    }
}


