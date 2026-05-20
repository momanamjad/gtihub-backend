# 🚀 Deployment Guide - GitHub Backend

## Local Development

### ✅ Setup Checklist

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   ```
   
3. **Update `.env` with MongoDB**
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/github-clone?retryWrites=true&w=majority
   JWT_SECRET=your_secret_key_here
   PORT=5000
   ```

4. **Start Server**
   ```bash
   npm run dev    # Development with auto-reload
   npm start      # Production mode
   ```

5. **Access API**
   - 🌐 **API Docs**: http://localhost:5000/api/docs
   - ✅ **Health Check**: http://localhost:5000/health
   - 🔗 **Root**: http://localhost:5000

---

## Vercel Deployment

### 📋 Prerequisites

- Vercel account (https://vercel.com)
- GitHub repository with this code
- MongoDB Atlas database (free tier available)

### 🔧 Step-by-Step Setup

#### **Step 1: Push Code to GitHub**

```bash
git init
git add .
git commit -m "Initial commit - GitHub backend with upgrades"
git remote add origin https://github.com/YOUR_USERNAME/github-backend.git
git push -u origin main
```

#### **Step 2: Import to Vercel**

1. Go to https://vercel.com/new
2. Click **Import Project**
3. Select your GitHub repository
4. Click **Import**

#### **Step 3: Configure Environment Variables**

In Vercel dashboard, go to **Settings > Environment Variables**

Add these variables:

```
MONGODB_URI = mongodb+srv://username:password@cluster.mongodb.net/github-clone?retryWrites=true&w=majority
JWT_SECRET = your_super_secret_key_change_this
NODE_ENV = production
CORS_ORIGIN = https://your-domain.com,https://your-frontend.vercel.app
```

**Important**: 
- Replace `username` and `password` with your MongoDB Atlas credentials
- Change `JWT_SECRET` to a strong random string
- Update `CORS_ORIGIN` with your actual domain

#### **Step 4: MongoDB IP Whitelist**

1. Go to https://cloud.mongodb.com/
2. Select your cluster → **Network Access**
3. Add IP Address → **Allow 0.0.0.0/0** (allow all IPs)
4. This is necessary for Vercel's changing IPs

#### **Step 5: Deploy**

1. Click **Deploy** in Vercel
2. Wait for deployment to complete
3. Get your Vercel URL from the dashboard

### ✅ Verify Deployment

```bash
# Replace with your Vercel URL
curl https://your-project.vercel.app/health

# Should return:
# {"status":"OK","message":"Server is running"}
```

---

## 🔍 Testing All Features

### **1. Local Testing**

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Run tests
npm test

# Terminal 3: Test endpoints
curl http://localhost:5000/api/docs
```

### **2. Vercel Testing**

Test via Swagger at: `https://your-project.vercel.app/api/docs`

Or via curl:

```bash
# Health check
curl https://your-project.vercel.app/health

# Register user
curl -X POST https://your-project.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "login": "testuser",
    "email": "test@example.com",
    "password": "TestPass123"
  }'

# Get public repos
curl https://your-project.vercel.app/api/repos/public/explore

# Get API docs
curl https://your-project.vercel.app/api/docs
```

---

## 🆘 Troubleshooting

### ❌ MongoDB Connection Error

**Error**: `querySrv EREFUSED`

**Solution**:
1. Check MongoDB URI in `.env` is correct
2. Whitelist IP in MongoDB Atlas (allow 0.0.0.0/0)
3. Verify credentials are correct
4. Test connection string on MongoDB Compass

### ❌ 502 Bad Gateway on Vercel

**Solution**:
1. Check Environment Variables are set correctly
2. Review Vercel logs: **Deployments > Logs**
3. Make sure `index.js` exports the app correctly
4. Check that dependencies installed: `npm install` in vercel.json builds

### ❌ CORS Error

**Error**: `Access to XMLHttpRequest blocked by CORS`

**Solution**:
1. Update `CORS_ORIGIN` in environment variables
2. Restart deployment in Vercel
3. Check that frontend URL is in the whitelist

### ❌ 404 on API Routes

**Solution**:
1. Ensure `/api/docs` works first
2. Check route imports in `index.js`
3. Verify all route files exist
4. Check `vercel.json` routes configuration

---

## 📊 Performance Optimization

### Local Development
- Use `npm run dev` for hot-reload
- Monitor MongoDB queries
- Check memory usage

### Vercel Production
- Vercel automatically optimizes
- Uses serverless functions
- Global CDN included
- Auto-scaling included

---

## 🔐 Security Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Use strong MongoDB password
- [ ] Enable MongoDB IP whitelist (but allow Vercel's changing IPs)
- [ ] Enable HTTPS (Vercel does this automatically)
- [ ] Update `CORS_ORIGIN` with actual domains
- [ ] Review rate limiting settings
- [ ] Enable helmet security headers
- [ ] Rotate JWT_SECRET regularly

---

## 📚 Useful Links

| Resource | URL |
|----------|-----|
| Vercel Docs | https://vercel.com/docs |
| MongoDB Atlas | https://cloud.mongodb.com |
| Node.js Runtime | https://vercel.com/docs/functions/serverless-functions/node-js |
| Environment Variables | https://vercel.com/docs/projects/environment-variables |
| Custom Domains | https://vercel.com/docs/custom-domains |

---

## 🚀 Deployment Commands

```bash
# Local
npm install
npm run dev
npm start

# Vercel (automatic on git push)
# Or manual:
npm i -g vercel
vercel

# View logs
vercel logs

# Set environment variable
vercel env add MONGODB_URI
vercel env pull .env.production.local
```

---

## 📈 Monitoring

### Local
- Check terminal logs for errors
- Use MongoDB Compass to inspect database
- Monitor network requests in browser DevTools

### Vercel
- **Deployments**: View build logs
- **Function**: Monitor execution time
- **Analytics**: View request patterns
- **Logs**: Real-time server logs

---

## ✨ Post-Deployment

1. **Test all endpoints** via Swagger
2. **Monitor logs** in Vercel dashboard
3. **Set up custom domain** if needed
4. **Enable email notifications** for errors
5. **Set up analytics** for traffic monitoring
6. **Document API** for frontend developers

---

## 🎯 Quick Start Checklists

### For Local Development
- [x] Clone repo
- [x] `npm install`
- [x] Configure `.env`
- [x] `npm start`
- [x] Visit `http://localhost:5000/api/docs`

### For Vercel Deployment
- [x] Push to GitHub
- [x] Import to Vercel
- [x] Set environment variables
- [x] Configure MongoDB whitelist
- [x] Deploy
- [x] Test `/api/docs` endpoint
- [x] Set up custom domain (optional)

---

**Need help?** Check [QUICKSTART.md](./QUICKSTART.md) and [README.md](./README.md)
