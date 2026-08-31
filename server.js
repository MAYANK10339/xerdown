require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

// Initialize database (creates tables on first run)
require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

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

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`\n  Xerdown Server`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  Created by Mayank Mandrai\n`);
});
