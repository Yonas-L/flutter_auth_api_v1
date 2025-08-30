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
    }

    async sendOtp(phoneNumber: string, codeLength: number = 4, ttl: number = 600): Promise<SendOtpResponse> {
        try {
            const url = new URL(`${this.baseUrl}/challenge`);

            // Add query parameters with your configuration
            url.searchParams.set('from', this.config.from);
            url.searchParams.set('sender', this.config.sender);
            url.searchParams.set('to', phoneNumber);
            url.searchParams.set('len', codeLength.toString());
            url.searchParams.set('t', '0'); // Numeric only
            url.searchParams.set('ttl', ttl.toString());
            url.searchParams.set('pr', this.config.prefix);
            if (this.config.suffix) {
                url.searchParams.set('ps', this.config.suffix);
            }

            console.log(`📱 Sending OTP via AfroMessage to ${phoneNumber}`);
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
                return {
                    success: true,
                    messageId: data.response.message_id,
                    verificationId: data.response.verificationId,
                    code: data.response.code,
                };
            } else {
                console.error(`❌ AfroMessage failed: ${data.response?.message || 'Unknown error'}`);
                return {
                    success: false,
                    error: data.response?.message || 'Unknown error',
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
            const url = new URL(`${this.baseUrl}/verify`);

            url.searchParams.set('to', phoneNumber);
            url.searchParams.set('code', code);
            if (verificationId) {
                url.searchParams.set('vc', verificationId);
            }

            console.log(`🔍 Verifying OTP for ${phoneNumber}: ${code}`);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ AfroMessage verify error: ${response.status} - ${errorText}`);
                throw new Error(`AfroMessage API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log(`📨 AfroMessage verify response:`, data);

            if (data.acknowledge === 'success') {
                console.log(`✅ OTP verified successfully for ${phoneNumber}`);
                return {
                    success: true,
                    valid: true,
                };
            } else {
                console.log(`❌ OTP verification failed for ${phoneNumber}: ${data.response?.message || 'Invalid code'}`);
                return {
                    success: true,
                    valid: false,
                    error: data.response?.message || 'Invalid code',
                };
            }
        } catch (error) {
            console.error('❌ AfroMessage verify OTP error:', error);
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
