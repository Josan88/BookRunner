'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { findCatalogItem } = require('../catalog');
const { asyncHandler, requireAuth } = require('../middleware/auth');

const router = express.Router();
const cartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_CART_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
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

router.get('/api/cart', cartLimiter, requireAuth, asyncHandler(async (req, res) => {
  const result = await db.query(
    `WITH consolidated AS (
       SELECT
         (ARRAY_AGG(id ORDER BY created_at DESC, id DESC))[1] AS id,
         user_id,
         book_id,
         (ARRAY_AGG(title ORDER BY created_at DESC, id DESC))[1] AS title,
         (ARRAY_AGG(volume ORDER BY created_at DESC, id DESC))[1] AS volume,
         (ARRAY_AGG(cover ORDER BY created_at DESC, id DESC))[1] AS cover,
         (ARRAY_AGG(unit_price ORDER BY created_at DESC, id DESC))[1] AS unit_price,
         SUM(quantity)::INTEGER AS quantity,
         MAX(created_at) AS created_at,
         MAX(updated_at) AS updated_at
       FROM cart_items
       WHERE user_id = $1
       GROUP BY user_id, book_id
     )
     SELECT ${CART_COLUMNS}
     FROM consolidated
     ORDER BY created_at DESC`,
    [req.user.sub],
  );

  return res.status(200).json(result.rows);
}));

router.post('/api/cart', cartLimiter, requireAuth, asyncHandler(async (req, res) => {
  const bookTitle = normalizeRequiredText(req.body?.book_title);
  const volume = normalizeRequiredText(req.body?.volume);
  const quantity = normalizeQuantity(req.body?.quantity);

  if (!bookTitle || !volume || !quantity) {
    return res.status(400).json({ error: 'book_title, volume, and quantity are required' });
  }

  const catalogItem = await findCatalogItem({
    bookId: req.body?.book_id,
    bookTitle,
    volume,
  });

  if (!catalogItem) {
    return res.status(404).json({ error: 'Book not found' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1 || \'::\' || $2))',
      [String(req.user.sub), String(catalogItem.bookId)],
    );

    const existingRows = await client.query(
      `SELECT id, quantity
       FROM cart_items
       WHERE user_id = $1 AND book_id = $2
       ORDER BY created_at DESC, id DESC
       FOR UPDATE`,
      [req.user.sub, catalogItem.bookId],
    );

    let result;
    if (existingRows.rows.length > 0) {
      const [keepRow, ...duplicateRows] = existingRows.rows;
      const mergedQuantity = existingRows.rows.reduce(
        (sum, row) => {
          const normalizedQuantity = Number(row.quantity);
          if (!Number.isFinite(normalizedQuantity) || normalizedQuantity < 0) {
            throw new Error('Invalid existing cart quantity');
          }
          return sum + normalizedQuantity;
        },
        0,
      ) + quantity;

      result = await client.query(
        `UPDATE cart_items
         SET quantity = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING ${CART_COLUMNS}`,
        [mergedQuantity, keepRow.id],
      );

      if (duplicateRows.length > 0) {
        await client.query(
          'DELETE FROM cart_items WHERE id = ANY($1::uuid[])',
          [duplicateRows.map((row) => row.id)],
        );
      }
    } else {
      result = await client.query(
        `INSERT INTO cart_items (user_id, book_id, title, volume, cover, unit_price, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${CART_COLUMNS}`,
        [
          req.user.sub,
          catalogItem.bookId,
          catalogItem.bookTitle,
          catalogItem.volume,
          catalogItem.cover,
          catalogItem.price,
          quantity,
        ],
      );
    }

    await client.query('COMMIT');
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}));

router.put('/api/cart/:id', cartLimiter, requireAuth, asyncHandler(async (req, res) => {
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

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Cart item not found' });
  }

  return res.status(200).json(result.rows[0]);
}));

router.delete('/api/cart/:id', cartLimiter, requireAuth, asyncHandler(async (req, res) => {
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

  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
