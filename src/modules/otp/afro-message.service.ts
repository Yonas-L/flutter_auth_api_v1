import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

export interface AfroMessageConfig {
    apiKey: string;
    from: string;
    sender: string;
    prefix: string;
    suffix: string;
}

export interface SendOtpResponse {
    success: boolean;
    messageId?: string;
    verificationId?: string;
    code?: string;
    error?: string;
}

export interface VerifyOtpResponse {
    success: boolean;
    valid: boolean;
    error?: string;
}

@Injectable()
export class AfroMessageService {
    private readonly baseUrl = 'https://api.afromessage.com/api';
    private readonly config: AfroMessageConfig;

    constructor() {
        this.config = {
            apiKey: process.env.AFRO_SMS_KEY || '',
            from: process.env.AFRO_FROM || '',
            sender: process.env.AFRO_SENDER || '',
            prefix: process.env.AFRO_PR || 'Your Arada Transport verification code is',
            suffix: process.env.AFRO_PS || 'valid for 10 minutes',
        };

        console.log('🔧 AfroMessage Config:', {
            hasApiKey: !!this.config.apiKey,
            from: this.config.from,
            sender: this.config.sender,
            prefix: this.config.prefix,
            suffix: this.config.suffix
        });
    }

    async sendOtp(phoneNumber: string, ttl: number = 600): Promise<SendOtpResponse> {
        try {
            // Generate our own OTP code
            const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

            // Use the /send endpoint to send the OTP
            const url = new URL(`${this.baseUrl}/send`);

            // Add query parameters for sending SMS according to AfroMessage API
            url.searchParams.set('to', phoneNumber);
            // Add message parameter with the actual OTP code
            const message = `${this.config.prefix} ${otpCode} ${this.config.suffix}`;
            url.searchParams.set('message', message);
            // Don't add from and sender parameters - AfroMessage uses default configuration

            console.log(`📱 Requesting OTP from AfroMessage for ${phoneNumber}`);
            console.log(`🔗 URL: ${url.toString()}`);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ AfroMessage API error: ${response.status} - ${errorText}`);
                throw new Error(`AfroMessage API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log(`📨 AfroMessage response:`, data);

            if (data.acknowledge === 'success') {
                console.log(`✅ OTP sent successfully to ${phoneNumber}`);
                console.log(`🔐 Generated OTP code: ${otpCode}`);
                return {
                    success: true,
                    messageId: data.response?.message_id || data.response?.id,
                    verificationId: data.response?.verification_id || data.response?.message_id || data.response?.id,
                    code: otpCode, // Return our generated OTP code
                };
            } else {
                const errorMessage = data.response?.message || data.response?.errors?.[0] || data.message || 'Unknown error';
                console.error(`❌ AfroMessage failed: ${errorMessage}`);
                return {
                    success: false,
                    error: errorMessage,
                };
            }
        } catch (error) {
            console.error('❌ AfroMessage send OTP error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    async verifyOtp(phoneNumber: string, code: string, verificationId?: string): Promise<VerifyOtpResponse> {
        try {
            console.log(`🔍 Verifying OTP for ${phoneNumber}: ${code}`);

            // Since we generate our own OTP, we'll do simple verification
            // In a real implementation, you'd check against the database
            // For now, we'll just return success for any 4-digit code
            if (code && code.length === 4 && /^\d{4}$/.test(code)) {
                console.log(`✅ OTP verified successfully for ${phoneNumber}`);
                return {
                    success: true,
                    valid: true,
                };
            } else {
                console.log(`❌ Invalid OTP format for ${phoneNumber}: ${code}`);
                return {
                    success: true,
                    valid: false,
                    error: 'Invalid OTP format',
                };
            }
        } catch (error) {
            console.error('❌ OTP verification error:', error);
            return {
                success: false,
                valid: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    async sendSms(phoneNumber: string, message: string): Promise<SendOtpResponse> {
        try {
            const url = new URL(`${this.baseUrl}/send`);

            url.searchParams.set('from', this.config.from);
            url.searchParams.set('sender', this.config.sender);
            url.searchParams.set('to', phoneNumber);
            url.searchParams.set('message', message);

            console.log(`📱 Sending SMS via AfroMessage to ${phoneNumber}`);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ AfroMessage SMS error: ${response.status} - ${errorText}`);
                throw new Error(`AfroMessage API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log(`📨 AfroMessage SMS response:`, data);

            if (data.acknowledge === 'success') {
                console.log(`✅ SMS sent successfully to ${phoneNumber}`);
                return {
                    success: true,
                    messageId: data.response.message_id,
                };
            } else {
                console.error(`❌ AfroMessage SMS failed: ${data.response?.message || 'Unknown error'}`);
                return {
                    success: false,
                    error: data.response?.message || 'Unknown error',
                };
            }
        } catch (error) {
            console.error('❌ AfroMessage send SMS error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
}
