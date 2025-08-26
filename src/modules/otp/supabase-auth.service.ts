import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn?: number;
  user?: any;
}

@Injectable()
export class SupabaseAuthService {
  private supabaseUrl = process.env.SUPABASE_URL as string;
  private serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  private pepper = (process.env.SUPABASE_PASSWORD_PEPPER as string) || 'pepper-default-change-me';

  private get emailDomain() {
    return process.env.SUPABASE_FAKE_EMAIL_DOMAIN || 'driver.local';
  }

  

  private phoneToEmail(phoneE164: string): string {
    const digits = phoneE164.replace(/[^0-9]/g, '');
    return `${digits}@${this.emailDomain}`;
  }

  private derivePassword(phoneE164: string): string {
    return crypto.createHash('sha256').update(`${this.pepper}:${phoneE164}`).digest('hex');
  }

  private headersJSON() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.serviceRoleKey,
      'Authorization': `Bearer ${this.serviceRoleKey}`,
    } as Record<string, string>;
  }

  async ensureUser(phoneE164: string, name?: string): Promise<{ email: string; password: string; }> {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    const email = this.phoneToEmail(phoneE164);
    const password = this.derivePassword(phoneE164);

    // Try create user (idempotent: ignore if exists)
    try {
      const createRes = await fetch(`${this.supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: this.headersJSON(),
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          phone: phoneE164,
          phone_confirm: true,
          user_metadata: { phone_e164: phoneE164, name },
        }),
      });
      if (!createRes.ok) {
        // 422 likely means already exists; ignore
        if (createRes.status !== 422) {
          const t = await createRes.text();
          throw new Error(`Supabase admin create user failed ${createRes.status}: ${t}`);
        }
      }
    } catch (e) {
      // If network or other, rethrow
      throw e;
    }

    return { email, password };
  }

  async issueTokens(email: string, password: string): Promise<TokenResponse> {
    const tokenRes = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: this.headersJSON(),
      body: JSON.stringify({ email, password }),
    });
    const body = await tokenRes.text();
    if (!tokenRes.ok) {
      throw new Error(`Supabase token error ${tokenRes.status}: ${body}`);
    }
    const data = JSON.parse(body);
    const refreshToken = data.refresh_token || data.refreshToken;
    const accessToken = data.access_token || data.accessToken;
    const tokenType = data.token_type || data.tokenType;
    const expiresIn = data.expires_in || data.expiresIn;
    if (!refreshToken) {
      throw new Error('Supabase did not return refresh_token');
    }
    if (!accessToken) {
      throw new Error('Supabase did not return access_token');
    }
    return {
      accessToken,
      refreshToken,
      tokenType,
      expiresIn,
      user: data.user ?? null,
    };
  }

  async createOrGetTokens(phoneE164: string, name?: string): Promise<TokenResponse> {
    const { email, password } = await this.ensureUser(phoneE164, name);
    // Perform password grant and return both tokens
    return this.issueTokens(email, password);
  }
}
