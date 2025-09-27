import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface ChapaPaymentRequest {
    amount: string;
    currency: string;
    email: string;
    first_name: string;
    last_name: string;
    phone_number: string;
    tx_ref: string;
    callback_url?: string;
    return_url?: string;
    customization?: {
        title?: string;
        description?: string;
        logo?: string;
    };
}

export interface ChapaPaymentResponse {
    status: string;
    message: string;
    data: {
        checkout_url: string;
    };
}

export interface ChapaVerifyResponse {
    status: string;
    message: string;
    data: {
        id: number;
        tx_ref: string;
        flw_ref: string;
        device_fingerprint: string;
        amount: number;
        currency: string;
        charged_amount: number;
        app_fee: number;
        merchant_fee: number;
        processor_response: string;
        auth_model: string;
        card: any;
        created_at: string;
        status: string;
        account_id: number;
        customer: {
            id: number;
            phone_number: string;
            name: string;
            email: string;
            created_at: string;
        };
    };
}

@Injectable()
export class ChapaService {
    private readonly logger = new Logger(ChapaService.name);
    private readonly baseUrl = 'https://api.chapa.co/v1';
    private readonly secretKey: string;
    private readonly publicKey: string;

    constructor(private configService: ConfigService) {
        this.secretKey = this.configService.get<string>('CHAPA_SECRET_KEY') || '';
        this.publicKey = this.configService.get<string>('CHAPA_PUBLIC_KEY') || '';

        if (!this.secretKey || !this.publicKey) {
            this.logger.error('Chapa API keys not configured properly');
            throw new Error('Chapa API keys not configured');
        }
    }

    /**
     * Initialize a payment with Chapa
     */
    async initializePayment(paymentData: ChapaPaymentRequest): Promise<ChapaPaymentResponse> {
        try {
            this.logger.log(`Initializing Chapa payment for tx_ref: ${paymentData.tx_ref}`);

            const response = await axios.post(
                `${this.baseUrl}/transaction/initialize`,
                paymentData,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            this.logger.log(`Chapa payment initialized successfully: ${response.data.message}`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to initialize Chapa payment: ${error.message}`);

            if (error.response?.data) {
                this.logger.error(`Chapa API Error: ${JSON.stringify(error.response.data)}`);
                throw new BadRequestException(`Payment initialization failed: ${error.response.data.message || 'Unknown error'}`);
            }

            throw new BadRequestException('Payment initialization failed. Please try again.');
        }
    }

    /**
     * Verify a payment with Chapa
     */
    async verifyPayment(txRef: string): Promise<ChapaVerifyResponse> {
        try {
            this.logger.log(`Verifying Chapa payment for tx_ref: ${txRef}`);

            const response = await axios.get(
                `${this.baseUrl}/transaction/verify/${txRef}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            this.logger.log(`Chapa payment verification completed: ${response.data.message}`);
            return response.data;
        } catch (error) {
            this.logger.error(`Failed to verify Chapa payment: ${error.message}`);

            if (error.response?.data) {
                this.logger.error(`Chapa API Error: ${JSON.stringify(error.response.data)}`);
                throw new BadRequestException(`Payment verification failed: ${error.response.data.message || 'Unknown error'}`);
            }

            throw new BadRequestException('Payment verification failed. Please try again.');
        }
    }

    /**
     * Get payment status
     */
    async getPaymentStatus(txRef: string): Promise<ChapaVerifyResponse> {
        return this.verifyPayment(txRef);
    }

    /**
     * Generate a unique transaction reference
     */
    generateTransactionRef(prefix: string = 'ARADA'): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `${prefix}_${timestamp}_${random}`.toUpperCase();
    }

    /**
     * Validate webhook signature (if Chapa provides signature verification)
     */
    validateWebhookSignature(payload: any, signature: string): boolean {
        // Chapa doesn't provide webhook signature verification in their current API
        // This is a placeholder for future implementation
        return true;
    }
}
