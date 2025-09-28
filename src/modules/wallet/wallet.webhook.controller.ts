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
        @Headers('chapa-signature') chapaSignatureA: string,
        @Headers('x-chapa-signature') chapaSignatureB: string,
    ) {
        const secretKey = process.env.CHAPA_SECRET_KEY || '';
        const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET || '';
        if (!secretKey) {
            throw new BadRequestException('Chapa secret key not configured');
        }

        const payloadString = JSON.stringify(payload);
        // x-chapa-signature: HMAC SHA256(payload, secret)
        const expectedSigB = crypto
            .createHmac('sha256', secretKey)
            .update(payloadString)
            .digest('hex');
        // Chapa-Signature: HMAC SHA256(secret, secret) when webhookSecret provided
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

        const result = await this.walletService.handlePaymentCallback(txRef, status as 'success' | 'failed');
        return { ok: true, result };
    }
}


