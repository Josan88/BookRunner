'use strict';

const express = require('express');
const db = require('../db');
const { asyncHandler, requireAuth } = require('../middleware/auth');

const router = express.Router();
const CART_COLUMNS = `
  id,
  user_id,
  book_id,
  title AS book_title,
  volume,
  cover,
  unit_price AS price,
  quantity,
  created_at,
  updated_at
`;

function normalizeRequiredText(value) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeQuantity(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function normalizePrice(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : null;
}

function resolveBookId(bookId, bookTitle, volume) {
  return normalizeRequiredText(bookId) ?? `${bookTitle}::${volume}`;
}

router.get('/resources/api_cart.php', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT ${CART_COLUMNS} FROM cart_items WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.sub],
  );

  return res.status(200).json(result.rows);
}));

router.post('/resources/api_cart.php', requireAuth, asyncHandler(async (req, res) => {
  const bookTitle = normalizeRequiredText(req.body?.book_title);
  const volume = normalizeRequiredText(req.body?.volume);
  const cover = normalizeRequiredText(req.body?.cover);
  const quantity = normalizeQuantity(req.body?.quantity);
  const price = normalizePrice(req.body?.price);

  if (!bookTitle || !volume || !cover || !quantity || price === null) {
    return res.status(400).json({ error: 'book_title, volume, cover, quantity, and price are required' });
  }

  const result = await db.query(
    `INSERT INTO cart_items (user_id, book_id, title, volume, cover, unit_price, quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, book_id)
     DO UPDATE SET
       title = EXCLUDED.title,
       volume = EXCLUDED.volume,
       cover = EXCLUDED.cover,
       unit_price = EXCLUDED.unit_price,
       quantity = cart_items.quantity + EXCLUDED.quantity,
       updated_at = NOW()
     RETURNING ${CART_COLUMNS}`,
    [
      req.user.sub,
      resolveBookId(req.body?.book_id, bookTitle, volume),
      bookTitle,
      volume,
      cover,
      price,
      quantity,
    ],
  );

  return res.status(201).json(result.rows[0]);
}));

router.put('/resources/api_cart.php/id/:id', requireAuth, asyncHandler(async (req, res) => {
  const quantity = normalizeQuantity(req.body?.quantity);

  if (!quantity) {
    return res.status(400).json({ error: 'A positive integer quantity is required' });
  }

  const result = await db.query(
    `UPDATE cart_items
     SET quantity = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING ${CART_COLUMNS}`,
    [quantity, req.params.id, req.user.sub],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Cart item not found' });
  }

  return res.status(200).json(result.rows[0]);
}));

router.delete('/resources/api_cart.php/id/:id', requireAuth, asyncHandler(async (req, res) => {
  const result = await db.query(
    'DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING id',
    [req.params.id, req.user.sub],
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Cart item not found' });
  }

  return res.status(200).json({ success: true, affected_rows: result.rowCount });
}));

router.use((error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
