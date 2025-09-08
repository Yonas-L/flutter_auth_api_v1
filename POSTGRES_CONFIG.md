# PostgreSQL Configuration for Arada Transport Driver

## Environment Variables Required

Add these environment variables to your `.env` file or Render environment:

```bash
# PostgreSQL Database Configuration
DATABASE_URL=postgresql://db_admin:7snpqJqfviJZ9bSo6ZXkvdQi9OXsqb9f@dpg-d2v8n0re5dus73fe8170-a.oregon-postgres.render.com/arada_main

# JWT Configuration
JWT_ACCESS_SECRET=your_jwt_access_secret_here
JWT_REFRESH_SECRET=your_jwt_refresh_secret_here
ACCESS_EXPIRES_IN=15m
REFRESH_EXPIRES_IN=7d

# SMS Configuration (AfroMessage)
AFRO_SMS_KEY=eyJhbGciOiJIUzI1NiJ9.eyJpZGVudGlmaWVyIjoiNUIzTlVFdEtSWUJyUHBaVTc2YzZvakk1UFhoRXIyS2MiLCJleHAiOjE5MTQ1Njg2MzAsImlhdCI6MTc1NjgwMjIzMCwianRpIjoiZGE5YzA3MTctMTRjYi00NDA5LWJhOGMtZjNjMTM2NDA3ZjVlIn0.15cCvFCA8BBv2rSQMemFsjMpRd7N-Jqs0_NcQcMXFnw
AFRO_FROM=e80ad9d8-adf3-463f-80f4-7c4b39f7f164
AFRO_SENDER=AradaTransport
AFRO_PR=Your Arada Transport verification code is
AFRO_PS=valid for 10 minutes

# Security
SMS_TOKEN=your_bearer_token_for_api_security

# Server Configuration
PORT=8080
NODE_ENV=development

# File Storage Configuration
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=image/jpeg,image/png,application/pdf
```

## Render Environment Variables

Update your Render backend service with these environment variables:

1. Go to your Render dashboard
2. Select your backend service
3. Go to Environment tab
4. Add/Update the following variables:

- `DATABASE_URL`: `postgresql://db_admin:7snpqJqfviJZ9bSo6ZXkvdQi9OXsqb9f@dpg-d2v8n0re5dus73fe8170-a.oregon-postgres.render.com/arada_main`
- `JWT_ACCESS_SECRET`: Your JWT access secret
- `JWT_REFRESH_SECRET`: Your JWT refresh secret
- `ACCESS_EXPIRES_IN`: `15m`
- `REFRESH_EXPIRES_IN`: `7d`
- `AFRO_SMS_KEY`: Your AfroMessage API key
- `AFRO_FROM`: Your AfroMessage from ID
- `AFRO_SENDER`: `AradaTransport`
- `AFRO_PR`: `Your Arada Transport verification code is`
- `AFRO_PS`: `valid for 10 minutes`
- `SMS_TOKEN`: Your SMS token for API security
- `PORT`: `8080`
- `NODE_ENV`: `production`
- `UPLOAD_DIR`: `./uploads`
- `MAX_FILE_SIZE`: `10485760`
- `ALLOWED_FILE_TYPES`: `image/jpeg,image/png,application/pdf`

## Database Connection Details

- **Host**: `dpg-d2v8n0re5dus73fe8170-a.oregon-postgres.render.com`
- **Port**: `5432`
- **Database**: `arada_main`
- **Username**: `db_admin`
- **Password**: `7snpqJqfviJZ9bSo6ZXkvdQi9OXsqb9f`
- **SSL**: Required (automatically handled by the connection string)

## Testing Connection

You can test the connection using psql:

```bash
PGPASSWORD=7snpqJqfviJZ9bSo6ZXkvdQi9OXsqb9f psql -h dpg-d2v8n0re5dus73fe8170-a.oregon-postgres.render.com -U db_admin arada_main
```
