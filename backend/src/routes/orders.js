'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { asyncHandler, requireAuth } = require('../middleware/auth');

const router = express.Router();
const ordersLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

function normalizeCartItemIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(
    values
      .map((value) => String(value ?? '').trim())
      .filter((value) => value.length > 0),
  )];
}

router.post('/resources/api_orders.php', ordersLimiter, requireAuth, asyncHandler(async (req, res) => {
  const cartItemIds = normalizeCartItemIds(req.body?.cart_item_ids);

  if (cartItemIds.length === 0) {
    return res.status(400).json({ error: 'cart_item_ids is required' });
  }

  await db.query('BEGIN');

  try {
    const cartItemsResult = await db.query(
      `SELECT id, book_id, title, volume, cover, unit_price, quantity
       FROM cart_items
       WHERE user_id = $1 AND id = ANY($2::uuid[])
       ORDER BY created_at ASC`,
      [req.user.sub, cartItemIds],
    );

    if (cartItemsResult.rows.length !== cartItemIds.length) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Cart item not found' });
    }

    const totalAmount = cartItemsResult.rows.reduce(
      (sum, item) => sum + (Number(item.unit_price) * Number(item.quantity)),
      0,
    );

    const orderResult = await db.query(
      'INSERT INTO orders (user_id, total_amount) VALUES ($1, $2) RETURNING id',
      [req.user.sub, totalAmount],
    );

    const orderId = orderResult.rows[0]?.id;

    for (const item of cartItemsResult.rows) {
      const lineTotal = Number(item.unit_price) * Number(item.quantity);

      await db.query(
        `INSERT INTO order_items (order_id, book_id, title, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.book_id, item.title, item.unit_price, item.quantity, lineTotal],
      );
    }

    await db.query(
      'DELETE FROM cart_items WHERE user_id = $1 AND id = ANY($2::uuid[])',
      [req.user.sub, cartItemIds],
    );

    await db.query('COMMIT');
    return res.status(201).json({ id: orderId });
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}));

router.use((error, _req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
