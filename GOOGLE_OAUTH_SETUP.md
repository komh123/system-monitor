# Google OAuth Setup Guide

## 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API** (required for OAuth)

## 2. Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Application type**: **Web application**
4. Configure:
   - **Name**: `System Monitor`
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (development)
     - `https://monitor.ko.unieai.com` (production)
   - **Authorized redirect URIs**:
     - `http://localhost:5173/login` (development)
     - `https://monitor.ko.unieai.com/login` (production)
5. Click **Create**
6. Copy **Client ID** and **Client Secret**

## 3. Configure Environment Variables

Create `.env` file in the project root:

```bash
# JWT Secret (generate a random string)
JWT_SECRET=$(openssl rand -base64 32)

# Google OAuth (paste your credentials)
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:5173/login

# Optional: Restrict to specific email domains
# ALLOWED_EMAIL_DOMAINS=example.com,company.com

# SMTP (for alerts - optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Server
PORT=3000
NODE_ENV=development
```

## 4. Install Dependencies

```bash
npm install
```

## 5. Start Development Server

```bash
# Backend
npm run dev

# Frontend (in another terminal)
cd client
npm run dev
```

## 6. Test Login Flow

1. Open `http://localhost:5173`
2. You'll be redirected to `/login`
3. Click "Sign in with Google"
4. Complete Google OAuth flow
5. You'll be redirected back to `/chat` after successful login

## Production Deployment

### Update OAuth Settings

1. Go back to Google Cloud Console > Credentials
2. Edit your OAuth client
3. Add production domains to:
   - **Authorized JavaScript origins**: `https://monitor.ko.unieai.com`
   - **Authorized redirect URIs**: `https://monitor.ko.unieai.com/login`

### Update Environment Variables

In production `.env`:

```bash
JWT_SECRET=<your-strong-secret-key>
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_REDIRECT_URI=https://monitor.ko.unieai.com/login
ALLOWED_EMAIL_DOMAINS=unieai.com  # Optional: restrict to your domain
NODE_ENV=production
PORT=3000
```

### Build and Deploy

```bash
# Build frontend
npm run build

# Start production server
npm start
```

## Security Best Practices

1. **Never commit `.env` to git** - Use `.env.example` instead
2. **Use strong JWT_SECRET** - Generate with `openssl rand -base64 32`
3. **Restrict email domains** - Set `ALLOWED_EMAIL_DOMAINS` in production
4. **Use HTTPS** - Always use SSL/TLS in production
5. **Rotate credentials** - Regularly rotate OAuth secrets and JWT keys

## Troubleshooting

### "Unauthorized: Invalid client"
- Check `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Ensure redirect URI in Google Console matches `GOOGLE_REDIRECT_URI`

### "Email domain not allowed"
- Check `ALLOWED_EMAIL_DOMAINS` in `.env`
- Remove the variable to allow all Google accounts

### Token expired
- JWT tokens expire after 7 days by default
- User needs to re-login after expiration
- Adjust `JWT_EXPIRES_IN` in `authRoutes.js` if needed

## Features

- ✅ Google OAuth 2.0 authentication
- ✅ JWT-based session management (7-day expiration)
- ✅ Protected routes (automatic redirect to login)
- ✅ Email domain restriction (optional)
- ✅ Token verification middleware
- ✅ Logout support
- ✅ Auto-login if valid token exists
