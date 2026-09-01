const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Safe JWT Secret with built-in robust fallback
const JWT_SECRET = process.env.JWT_SECRET || 'xerdown_super_secure_jwt_fallback_secret_key_2026_x89q2';

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Check existing user
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(cleanEmail, cleanUsername);
    if (existingUser) {
      return res.status(409).json({ error: 'Username or email already exists.' });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(cleanUsername, cleanEmail, hashedPassword);

    // Generate JWT
    const token = jwt.sign(
      { id: result.lastInsertRowid, username: cleanUsername, email: cleanEmail },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Set httpOnly cookie
    res.cookie('xerdown_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.status(201).json({
      message: 'Account created successfully.',
      user: { id: result.lastInsertRowid, username: cleanUsername, email: cleanEmail }
    });
  } catch (err) {
    console.error('Signup error details:', err);
    res.status(500).json({ error: 'Server error: ' + (err.message || 'Please try again.') });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find user by email or username
    const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(cleanEmail, email.trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Compare password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.cookie('xerdown_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      message: 'Logged in successfully.',
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    console.error('Login error details:', err);
    res.status(500).json({ error: 'Server error: ' + (err.message || 'Please try again.') });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('xerdown_token');
  res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, email, storage_used, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json({ user });
});

module.exports = router;
