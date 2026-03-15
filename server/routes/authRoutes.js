import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

// JWT secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '7d';

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/login';

// Allowed email domains (optional - remove to allow all Google accounts)
const ALLOWED_DOMAINS = process.env.ALLOWED_EMAIL_DOMAINS
  ? process.env.ALLOWED_EMAIL_DOMAINS.split(',')
  : [];

// Allowed specific emails (optional - whitelist specific email addresses)
const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(',').map(e => e.trim().toLowerCase())
  : [];

/**
 * GET /api/auth/google/url
 * Generate Google OAuth URL
 */
router.get('/google/url', (req, res) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({
      error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID in .env'
    });
  }

  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const options = {
    redirect_uri: GOOGLE_REDIRECT_URI,
    client_id: GOOGLE_CLIENT_ID,
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
  };

  const qs = new URLSearchParams(options);
  const url = `${rootUrl}?${qs.toString()}`;

  res.json({ url });
});

/**
 * POST /api/auth/google/callback
 * Exchange Google OAuth code for user token
 */
router.post('/google/callback', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({
      error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'
    });
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokens.access_token) {
      console.error('[Auth] Token exchange failed:', tokens);
      return res.status(400).json({ error: 'Failed to exchange authorization code' });
    }

    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const userInfo = await userResponse.json();

    if (!userInfo.email) {
      return res.status(400).json({ error: 'Failed to get user email' });
    }

    // Check allowed emails (if configured) - takes priority over domain restriction
    if (ALLOWED_EMAILS.length > 0) {
      const userEmail = userInfo.email.toLowerCase();
      if (!ALLOWED_EMAILS.includes(userEmail)) {
        return res.status(403).json({
          error: `Email ${userInfo.email} is not allowed. Contact your administrator.`
        });
      }
    } else if (ALLOWED_DOMAINS.length > 0) {
      // Check allowed domains only if email whitelist is not configured
      const emailDomain = userInfo.email.split('@')[1];
      if (!ALLOWED_DOMAINS.includes(emailDomain)) {
        return res.status(403).json({
          error: `Email domain ${emailDomain} is not allowed. Contact your administrator.`
        });
      }
    }

    // Generate JWT
    const payload = {
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      sub: userInfo.id,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    console.log(`[Auth] User logged in: ${userInfo.email}`);

    res.json({
      token,
      user: {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    });

  } catch (err) {
    console.error('[Auth] OAuth callback error:', err);
    res.status(500).json({ error: 'Authentication failed. Please try again.' });
  }
});

/**
 * GET /api/auth/verify
 * Verify JWT token
 */
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({
      valid: true,
      user: {
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
      },
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal)
 */
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

/**
 * Middleware: Verify JWT token
 * Usage: router.get('/protected', verifyToken, (req, res) => { ... })
 */
export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export default router;
