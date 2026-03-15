# Deployment Checklist - v2.29.0

## ✅ Pre-Deployment

### 1. Code Changes Completed

- [x] Google OAuth authentication system
- [x] Protected routes with JWT
- [x] Login page UI
- [x] Logout button
- [x] Session drawer collapsible feature
- [x] Cmd+K fix (works with text input)
- [x] Plugin skills in static list
- [x] Dependencies installed (`jsonwebtoken`)

### 2. Environment Setup Required

**Backend `.env` file** (create at `/home/ubuntu/system-monitor/.env`):

```bash
# JWT Secret (generate new key)
JWT_SECRET=REPLACE_WITH_RANDOM_STRING

# Google OAuth Credentials
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://monitor.ko.unieai.com/login

# Optional: Email domain restriction
ALLOWED_EMAIL_DOMAINS=unieai.com

# Existing SMTP config
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Server
PORT=3000
NODE_ENV=production
```

### 3. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** > **Credentials**
3. Create OAuth 2.0 Client ID:
   - **Application type**: Web application
   - **Authorized JavaScript origins**:
     - `https://monitor.ko.unieai.com`
   - **Authorized redirect URIs**:
     - `https://monitor.ko.unieai.com/login`
4. Copy **Client ID** and **Client Secret** to `.env`

---

## 🚀 Deployment Steps

### Step 1: Generate JWT Secret

```bash
cd /home/ubuntu/system-monitor
openssl rand -base64 32
```

Copy the output and add to `.env` as `JWT_SECRET`

### Step 2: Create .env File

```bash
cd /home/ubuntu/system-monitor
nano .env
# Paste the template above and fill in values
# Save and exit (Ctrl+X, Y, Enter)
```

### Step 3: Build Frontend

```bash
cd /home/ubuntu/system-monitor
npm run build
```

Expected output: `dist/` directory created with production build

### Step 4: Test Backend Locally (Optional)

```bash
cd /home/ubuntu/system-monitor
NODE_ENV=development npm run dev
```

Open another terminal and test:
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test auth URL endpoint
curl http://localhost:3000/api/auth/google/url
```

### Step 5: Deploy to Production

#### Option A: Docker Build & Deploy

```bash
cd /home/ubuntu/system-monitor

# Build Docker image
sudo docker build -t localhost:30500/system-monitor:v2.29.0 .

# Push to registry
sudo docker push localhost:30500/system-monitor:v2.29.0

# Update k8s deployment
sudo kubectl set image deployment/system-monitor \
  system-monitor=localhost:30500/system-monitor:v2.29.0 \
  -n deployer-dev

# Wait for rollout
sudo kubectl rollout status deployment/system-monitor -n deployer-dev
```

#### Option B: Direct PM2 Restart (if not using Docker)

```bash
cd /home/ubuntu/system-monitor
pm2 restart system-monitor
pm2 logs system-monitor --lines 50
```

---

## 🧪 Testing

### 1. Access Application

Open browser: `https://monitor.ko.unieai.com`

### 2. Test Login Flow

1. Should redirect to `/login`
2. Click "Sign in with Google"
3. Complete Google OAuth
4. Should redirect to `/chat`
5. Check that Navigation shows "Logout" button

### 3. Test Protected Routes

```bash
# Try accessing without token (should redirect to login)
curl -I https://monitor.ko.unieai.com/chat
# Should return 200 (serves index.html for client-side routing)

# Test auth API
curl https://monitor.ko.unieai.com/api/auth/google/url
# Should return JSON with Google OAuth URL
```

### 4. Test Session Drawer

Desktop:
1. Go to `/chat`
2. Look for Session drawer on left
3. Click `«` button at bottom to collapse
4. Click `»` button to expand
5. Verify state persists after refresh

Mobile:
1. Open on mobile device
2. Click hamburger menu to open drawer
3. Drawer should slide in from left
4. Click outside to close

### 5. Test Cmd+K

1. Go to `/chat`
2. Type some text in message input
3. Press `Cmd+K` (or `Ctrl+K`)
4. Command Palette should open
5. Should see plugin skills: `pua:pua`, `pua:pua-debugging`

### 6. Test Logout

1. Click "Logout" button in navigation
2. Should redirect to `/login`
3. Try accessing `/chat` - should redirect back to `/login`

---

## 🐛 Troubleshooting

### Issue: "Google OAuth not configured"

**Solution**: Check `.env` file exists and contains `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

```bash
cat /home/ubuntu/system-monitor/.env | grep GOOGLE
```

### Issue: "Redirect URI mismatch"

**Solution**: Verify redirect URI in Google Cloud Console matches exactly:
- Production: `https://monitor.ko.unieai.com/login`
- Development: `http://localhost:5173/login`

### Issue: "Invalid or expired token"

**Solution**:
1. Clear browser localStorage
2. Re-login with Google
3. Check `JWT_SECRET` is set in `.env`

### Issue: Backend not starting

**Solution**:
```bash
# Check logs
pm2 logs system-monitor --lines 100

# Or check Docker logs
sudo kubectl logs -l app=system-monitor -n deployer-dev --tail=100

# Common issues:
# 1. Missing .env file
# 2. Invalid JSON in .env
# 3. Port 3000 already in use
```

### Issue: Frontend shows blank page

**Solution**:
1. Check browser console for errors
2. Verify build completed: `ls -la dist/`
3. Check NODE_ENV is 'production'
4. Clear browser cache

---

## 📊 Verification

After deployment, verify:

- [ ] Can access `https://monitor.ko.unieai.com`
- [ ] Redirects to `/login` when not authenticated
- [ ] Google OAuth login works
- [ ] JWT token stored in localStorage
- [ ] Can access `/chat` after login
- [ ] Session drawer collapses/expands (desktop)
- [ ] Cmd+K opens Command Palette with text input
- [ ] Plugin skills visible in Command Palette
- [ ] Logout button works
- [ ] Mobile drawer works (slide in/out)

---

## 🔄 Rollback Plan

If issues occur:

### Option 1: Rollback Docker Image

```bash
# Rollback to previous version
sudo kubectl set image deployment/system-monitor \
  system-monitor=localhost:30500/system-monitor:v2.28.0-pwa \
  -n deployer-dev
```

### Option 2: Rollback Git Commit

```bash
cd /home/ubuntu/system-monitor
git log --oneline -5  # Find previous commit
git reset --hard <commit-hash>
npm install
npm run build
pm2 restart system-monitor
```

---

## 📝 Post-Deployment

1. **Monitor Logs** (first 30 minutes):
   ```bash
   pm2 logs system-monitor --lines 100
   # or
   sudo kubectl logs -f -l app=system-monitor -n deployer-dev
   ```

2. **Check Error Rate**:
   - Monitor Google OAuth callback errors
   - Check for JWT verification failures
   - Look for 401 unauthorized responses

3. **User Feedback**:
   - Ask users to test login flow
   - Verify no issues with existing sessions
   - Check mobile experience

4. **Documentation Update**:
   - Update README with Google OAuth setup
   - Add troubleshooting guide
   - Document environment variables

---

## 🔐 Security Notes

1. **JWT_SECRET**: Never commit to git, rotate periodically
2. **Google Client Secret**: Keep confidential, rotate if exposed
3. **HTTPS**: Always use HTTPS in production for OAuth
4. **Email Restriction**: Consider enabling `ALLOWED_EMAIL_DOMAINS` for production
5. **Token Expiry**: Current: 7 days - adjust if needed in `authRoutes.js`

---

## 📚 Related Documentation

- [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md) - Complete OAuth setup guide
- [FEATURES_V2.29.0_AUTH.md](FEATURES_V2.29.0_AUTH.md) - Feature documentation
- [.env.example](.env.example) - Environment template

---

**Deployment Date**: _____________

**Deployed By**: _____________

**Rollback Required**: ☐ Yes  ☐ No

**Notes**:
_____________________________________________
_____________________________________________
_____________________________________________
