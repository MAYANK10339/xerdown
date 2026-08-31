# Xerdown — High-Throughput File Hosting Infrastructure

Xerdown is a high-performance, enterprise-grade file hosting and distribution platform engineered with an ultra-smooth 60FPS Liquid Glass design system, an instant deduplication engine, and an adaptive parallel multi-stream chunking engine capable of uploading files of any size with **No Size Limits** at peak line rates (100MB/s+ for files >= 1GB, 50MB/s+ for smaller files).

Created by **Mayank Mandrai**

---

## Core Capabilities

- **No File Size Limits**: Upload files of any size (megabytes, gigabytes, terabytes) with zero artificial caps.
- **Adaptive Multi-Stream Chunking**: Automatically segments files >= 1GB into 40MB slices across 10 concurrent streams (100MB/s+ throughput), and smaller files across 6 concurrent streams (50MB/s+ throughput).
- **Instant Deduplication Fast-Track**: Fingerprint matching verifies pre-existing files on server and registers instant share links in under 20ms.
- **Lightweight 60FPS Liquid Glass UI**: Hardware-accelerated frosted glass cards (`backdrop-filter: blur(14px)`), zero-lag CSS gradients, and full mobile & desktop responsiveness.
- **16MB HighWaterMark Streaming Downloads**: Native stream piping with full HTTP Range resume support for uninterrupted high-speed downloads.
- **Secure Authentication**: Signed JWT session cookies with bcrypt password hashing and user isolation.
- **Clean Distribution Links**: Unique nano-IDs for secure distribution without exposing internal storage paths.

---

## Technical Stack

| Layer | Technologies |
|---|---|
| **Runtime & Server** | Node.js (v20+ LTS), Express.js |
| **Storage Engine** | SQLite (`better-sqlite3`) with WAL journal mode |
| **File I/O** | Native Streams, Multer (Memory & Disk), 16MB highWaterMark |
| **Frontend** | Vanilla JavaScript (ES6+), Modern Optimized Vanilla CSS (Zero Lag, 60FPS) |
| **Typography** | Plus Jakarta Sans, JetBrains Mono |
| **Icon System** | Custom Inline SVG Architecture |

---

## Local Deployment

```bash
# 1. Clone repository
git clone https://github.com/your-username/xerdown.git
cd xerdown

# 2. Install dependencies
npm install

# 3. Start development server
node server.js
# Or with auto-restart:
npm run dev

# 4. Access console
# http://localhost:3000
```

---

## 24/7 Cloud Hosting & Free Domain Setup (No PC Required, 100% Free, No Credit Card)

Follow these steps to keep Xerdown online 24 hours a day, 7 days a week in the cloud without keeping your local computer turned on:

---

### Step 1: Deploy to Free Cloud Host (Render.com)

1. Push your Xerdown repository to **GitHub**.
2. Visit [Render.com](https://render.com) and log in with your GitHub account (**No credit card or payment info required**).
3. Click **New +** → **Web Service** → Select your `xerdown` repository.
4. Configure service parameters:
   - **Name**: `xerdown-app`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free ($0/month)`
5. Under **Environment Variables**, add:
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = `generate_any_secure_random_string_here`
6. Click **Deploy Web Service**.
7. Render will build and deploy your app with a free HTTPS URL (e.g., `https://xerdown-app.onrender.com`).

---

### Step 2: Keep the Cloud Instance Running 24/7 (Prevent Sleep Mode)

Render's free tier idles if no requests are received for 15 minutes. To keep it running 24/7 continuously:

1. Go to [Cron-Job.org](https://cron-job.org) or [UptimeRobot.com](https://uptimerobot.com) and create a free account.
2. Click **Create Monitor** / **Create Cronjob**.
3. Set the target URL to your Render app URL: `https://xerdown-app.onrender.com`
4. Set the ping interval to **every 5 minutes**.
5. Save the monitor.
6. **Result**: The automated ping keeps your Render cloud container awake 24/7/365 without your PC being on.

---

### Step 3: Configure Free Permanent Custom Domain (DuckDNS)

1. Go to [DuckDNS.org](https://www.duckdns.org) and log in with Google or GitHub.
2. Enter your desired subdomain (e.g., `myfiles`) and click **Add Domain**.
3. If using Render, add a CNAME record in your domain settings pointing to `xerdown-app.onrender.com` or configure DuckDNS URL forwarding.
4. You now have a permanent free custom domain with automated SSL.

---

## License

MIT License © Mayank Mandrai. Free for personal and commercial deployment.
