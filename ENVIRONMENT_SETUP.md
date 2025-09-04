# Environment Setup for Arada Transport Backend

## Required Environment Variables

Create a `.env` file in the `backend/server/` directory with the following variables:

```bash
# AfroMessage Configuration (Your Credentials - LATEST)
AFRO_SMS_KEY=eyJhbGciOiJIUzI1NiJ9.eyJpZGVudGlmaWVyIjoiNUIzTlVFdEtSWUJyUHBaVTc2YzZvakk1UFhoRXIyS2MiLCJleHAiOjE5MTQ1Njg2MzAsImlhdCI6MTc1NjgwMjIzMCwianRpIjoiZGE5YzA3MTctMTRjYi00NDA5LWJhOGMtZjNjMTM2NDA3ZjVlIn0.15cCvFCA8BBv2rSQMemFsjMpRd7N-Jqs0_NcQcMXFnw
AFRO_FROM=e80ad9d8-adf3-463f-80f4-7c4b39f7f164
AFRO_SENDER=AradaTransport
AFRO_PR=Your Arada Transport verification code is
AFRO_PS=valid for 10 minutes

# Security
SMS_TOKEN=your_bearer_token_for_api_security

# Supabase Configuration (Legacy Keys - Current Implementation)
SUPABASE_URL=https://feesvwfnxhyiovmzrtfr.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZXN2d2ZueGh5aW92bXpydGZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5NDQ5NTIsImV4cCI6MjA3MTUyMDk1Mn0.oQl3JJbw6JeXpy3ivbICjjmWv4-wgDjH-_GC0OZPMrA
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZXN2d2ZueGh5aW92bXpydGZyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTk0NDk1MiwiZXhwIjoyMDcxNTIwOTUyfQ.zuA49VHndmoKyiXTRWBXuAMfQCXeDTj81s_kzidC50c
SUPABASE_PASSWORD_PEPPER=your_pepper_for_password_derivation
SUPABASE_FAKE_EMAIL_DOMAIN=driver.local

# JWT Configuration
JWT_ACCESS_SECRET=your_jwt_access_secret
JWT_REFRESH_SECRET=your_jwt_refresh_secret
ACCESS_EXPIRES_IN=15m
REFRESH_EXPIRES_IN=7d

# Database Configuration
DATABASE_URL=your_database_url

# Server Configuration
PORT=8080
NODE_ENV=production

# Render Deployment Configuration
# The backend is deployed on Render at: https://arada-transport-sms-backend.onrender.com
# Environment variables are configured in the Render dashboard
```

## AfroMessage Configuration Details

### Your AfroMessage Credentials:
- **API Token**: `eyJhbGciOiJIUzI1NiJ9.eyJpZGVudGlmaWVyIjoiNUIzTlVFdEtSWUJyUHBaVTc2YzZvakk1UFhoRXIyS2MiLCJleHAiOjE5MTQ1Njg2MzAsImlhdCI6MTc1NjgwMjIzMCwianRpIjoiZGE5YzA3MTctMTRjYi00NDA5LWJhOGMtZjNjMTM2NDA3ZjVlIn0.15cCvFCA8BBv2rSQMemFsjMpRd7N-Jqs0_NcQcMXFnw`
- **Valid Until**: August 28, 2030, 2:28:30 PM
- **Identifier ID**: `e80ad9d8-adf3-463f-80f4-7c4b39f7f164`
- **Sender Name**: `AradaTransport`

### Message Configuration:
- **Prefix**: "Your Arada Transport verification code is"
- **Suffix**: "valid for 10 minutes"
- **Code Length**: 4 digits
- **TTL**: 600 seconds (10 minutes)

## Testing Your Configuration

### Test AfroMessage API:
```bash
curl -XGET -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJpZGVudGlmaWVyIjoiNUIzTlVFdEtSWUJyUHBaVTc2YzZvakk1UFhoRXIyS2MiLCJleHAiOjE5MTQ1Njg2MzAsImlhdCI6MTc1NjgwMjIzMCwianRpIjoiZGE5YzA3MTctMTRjYi00NDA5LWJhOGMtZjNjMTM2NDA3ZjVlIn0.15cCvFCA8BBv2rSQMemFsjMpRd7N-Jqs0_NcQcMXFnw' \
    -H "Content-type: application/json" \
    'https://api.afromessage.com/api/challenge?from=e80ad9d8-adf3-463f-80f4-7c4b39f7f164&sender=AradaTransport&to=+251912345678&len=4&t=0&ttl=600&pr=Your Arada Transport verification code is&ps=valid for 10 minutes'
```

### Test Backend OTP Endpoints:
```bash
# Send OTP
curl -X POST http://localhost:3000/auth/otp/request-phone \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+251912345678"}'

# Verify OTP
curl -X POST http://localhost:3000/auth/otp/verify-phone \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+251912345678", "code": "1234"}'
```

## Security Notes

1. **SMS_TOKEN**: Set a secure bearer token for API authentication
2. **JWT Secrets**: Use strong, unique secrets for JWT signing
3. **Database URL**: Use secure database connection strings
4. **Environment**: Set NODE_ENV=production for production deployments

## Troubleshooting

### Common Issues:
1. **AfroMessage API Errors**: Check your API token and identifier configuration
2. **Supabase Connection**: Verify your Supabase URL and keys
3. **JWT Errors**: Ensure JWT secrets are properly configured
4. **Database Issues**: Check your database connection string

### Debug Mode:
Set `NODE_ENV=development` to enable detailed logging for debugging.
