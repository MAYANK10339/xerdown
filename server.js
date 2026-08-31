require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const https = require('https');
const http = require('http');

// Initialize database
require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(cookieParser());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// --- Health Check Endpoint for Built-in Keep-Alive ---
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// --- API Routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/files', require('./routes/files'));
app.use('/api/download', require('./routes/download'));

// --- SPA Fallback: serve download page for /d/:shareId ---
app.get('/d/:shareId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'download.html'));
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// --- Autonomous Built-In 24/7 Self-KeepAlive Engine ---
function startAutonomousKeepAlive() {
  const targetUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;

  if (targetUrl) {
    console.log(`[KeepAlive] 24/7 Autonomous Self-Ping initialized for: ${targetUrl}`);
    // Ping self every 10 minutes (600,000 ms) to keep cloud container awake 24/7
    setInterval(() => {
      try {
        const client = targetUrl.startsWith('https') ? https : http;
        client.get(`${targetUrl}/api/health`, (res) => {
          console.log(`[KeepAlive] Self-ping status: ${res.statusCode} at ${new Date().toLocaleTimeString()}`);
        }).on('error', (err) => {
          console.error('[KeepAlive] Self-ping error:', err.message);
        });
      } catch (e) {
        console.error('[KeepAlive] Error:', e.message);
      }
    }, 10 * 60 * 1000);
  }
}

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`\n  Xerdown Server`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  Created by Mayank Mandrai\n`);
  
  startAutonomousKeepAlive();
});
