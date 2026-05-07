'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ sub: String(user.id), email: user.email }, secret, { expiresIn: '24h' });
}

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------------------------------------------------------------------------
// POST /resources/api_user.php
//   Body contains `name` (or `username`) + `email` + `password`  → register
//   Body contains only `email` + `password`                       → login
// ---------------------------------------------------------------------------

router.post('/resources/api_user.php', authLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  const name = req.body?.name ?? req.body?.username;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // --- REGISTRATION ---
  if (name !== undefined && name !== null && name !== '') {
    if (typeof name !== 'string' || name.trim().length < 1) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Duplicate email check
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)',
      [name.trim(), email, passwordHash],
    );

    return res.status(201).json({ success: true });
  }

  // --- LOGIN ---
  const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken(user);
  return res.status(200).json({ id: user.id, name: user.name, email: user.email, token });
});

// ---------------------------------------------------------------------------
// GET /resources/api_user.php/id/:id  – fetch profile (authenticated)
// ---------------------------------------------------------------------------

router.get('/resources/api_user.php/id/:id', profileLimiter, requireAuth, async (req, res) => {
  const { id } = req.params;

  if (String(req.user.sub) !== String(id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const result = await db.query(
    'SELECT id, name, email, created_at FROM users WHERE id = $1',
    [id],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json(result.rows[0]);
});

// ---------------------------------------------------------------------------
// PUT /resources/api_user.php/id/:id  – update profile (authenticated)
// ---------------------------------------------------------------------------

router.put('/resources/api_user.php/id/:id', profileLimiter, requireAuth, async (req, res) => {
  const { id } = req.params;

  if (String(req.user.sub) !== String(id)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const updates = {};
  const { name, email, password } = req.body ?? {};

  if (name !== undefined) {
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (trimmedName.length < 1) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }
    updates.name = trimmedName;
  }

  if (email !== undefined) {
    if (typeof email !== 'string' || email.trim().length < 1) {
      return res.status(400).json({ error: 'Email cannot be empty' });
    }
    // Duplicate email check (exclude current user)
    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1 AND id != $2',
      [email.trim(), id],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }
    updates.email = email.trim();
  }

  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    updates.password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const setClauses = Object.keys(updates).map((col, i) => `${col} = $${i + 1}`);
  setClauses.push(`updated_at = NOW()`);
  const values = [...Object.values(updates), id];

  await db.query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
    values,
  );

  return res.status(200).json({ success: true, affected_rows: 1 });
});

module.exports = router;
