'use strict';

// Set JWT_SECRET before loading the app so token signing works in tests
process.env.JWT_SECRET = 'test-secret-for-unit-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const db = require('./db');
const app = require('./index');

// ---------------------------------------------------------------------------
// Helper – start a temporary server on a random port and tear it down after
// ---------------------------------------------------------------------------
async function withServer(fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address();
  try {
    await fn(port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

// Helper – produce a signed JWT for a given user id
function makeToken(id, email = 'user@example.com') {
  return jwt.sign({ sub: String(id), email }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

// ---------------------------------------------------------------------------
// Existing health check
// ---------------------------------------------------------------------------

test('GET /health returns status ok', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { status: 'ok' });
  });
});

// ---------------------------------------------------------------------------
// POST /resources/api_user.php – input validation (no database required)
// ---------------------------------------------------------------------------

test('POST /resources/api_user.php returns 400 when body is empty', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.ok(payload.error, 'should return an error message');
  });
});

test('POST /resources/api_user.php returns 400 when password is missing', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com' }),
      },
    );
    assert.equal(response.status, 400);
  });
});

test('POST /resources/api_user.php returns 400 when email is missing', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'secret' }),
      },
    );
    assert.equal(response.status, 400);
  });
});

test('POST /resources/api_user.php returns 400 when name is present but empty (registration)', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', email: 'user@example.com', password: 'password123' }),
      },
    );
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.ok(payload.error);
  });
});

// ---------------------------------------------------------------------------
// POST /resources/api_user.php – registration (mocked db)
// ---------------------------------------------------------------------------

test('POST /resources/api_user.php registers a new user successfully', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    // Email-check SELECT returns empty; INSERT returns nothing meaningful
    if (sql.includes('SELECT')) return { rows: [] };
    return { rows: [], rowCount: 1 };
  });

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice', email: 'alice@example.com', password: 'password123' }),
      },
    );
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.success, true);
  });
});

test('POST /resources/api_user.php returns 409 when email already registered', async (t) => {
  t.mock.method(db, 'query', async () => {
    return { rows: [{ id: 'existing-id' }] };
  });

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice', email: 'existing@example.com', password: 'password123' }),
      },
    );
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.ok(payload.error);
  });
});

// ---------------------------------------------------------------------------
// POST /resources/api_user.php – login (mocked db)
// ---------------------------------------------------------------------------

test('POST /resources/api_user.php logs in and returns a JWT', async (t) => {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('correctpassword', 4); // low rounds for speed

  t.mock.method(db, 'query', async () => ({
    rows: [{ id: 'user-uuid-1', name: 'Alice', email: 'alice@example.com', password_hash: hash }],
  }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com', password: 'correctpassword' }),
      },
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 'user-uuid-1');
    assert.equal(payload.name, 'Alice');
    assert.ok(payload.token, 'should return a JWT token');

    // Verify the token is a valid JWT
    const decoded = jwt.verify(payload.token, process.env.JWT_SECRET);
    assert.equal(decoded.sub, 'user-uuid-1');
  });
});

test('POST /resources/api_user.php returns 401 for wrong password', async (t) => {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('correctpassword', 4);

  t.mock.method(db, 'query', async () => ({
    rows: [{ id: 'user-uuid-1', name: 'Alice', email: 'alice@example.com', password_hash: hash }],
  }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com', password: 'wrongpassword' }),
      },
    );
    assert.equal(response.status, 401);
  });
});

test('POST /resources/api_user.php returns 401 when user not found', async (t) => {
  t.mock.method(db, 'query', async () => ({ rows: [] }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@example.com', password: 'password' }),
      },
    );
    assert.equal(response.status, 401);
  });
});

test('POST /resources/api_user.php returns JSON 500 when database query fails', async (t) => {
  t.mock.method(db, 'query', async () => {
    throw new Error('database unavailable');
  });

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com', password: 'correctpassword' }),
        signal: AbortSignal.timeout(1000),
      },
    );
    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.equal(payload.error, 'Internal server error');
  });
});

// ---------------------------------------------------------------------------
// GET /resources/api_user.php/id/:id – auth required (no database required)
// ---------------------------------------------------------------------------

test('GET /resources/api_user.php/id/:id returns 401 without Authorization header', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/some-uuid`,
    );
    assert.equal(response.status, 401);
  });
});

test('GET /resources/api_user.php/id/:id returns 401 with invalid token', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/some-uuid`,
      { headers: { Authorization: 'Bearer not-a-valid-jwt' } },
    );
    assert.equal(response.status, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /resources/api_user.php/id/:id – authenticated profile fetch (mocked db)
// ---------------------------------------------------------------------------

test('GET /resources/api_user.php/id/:id returns 403 when token user != path user', async () => {
  const token = makeToken('other-uuid');

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/target-uuid`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 403);
  });
});

test('GET /resources/api_user.php/id/:id returns 200 with own profile', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({
    rows: [{ id: userId, name: 'Alice', email: 'alice@example.com', created_at: new Date().toISOString() }],
  }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/${userId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, userId);
    assert.equal(payload.name, 'Alice');
  });
});

test('GET /resources/api_user.php/id/:id returns 404 when user not found', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({ rows: [] }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/${userId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 404);
  });
});

// ---------------------------------------------------------------------------
// PUT /resources/api_user.php/id/:id – auth required (no database required)
// ---------------------------------------------------------------------------

test('PUT /resources/api_user.php/id/:id returns 401 without Authorization header', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/some-uuid`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' }),
      },
    );
    assert.equal(response.status, 401);
  });
});

test('PUT /resources/api_user.php/id/:id returns 401 with invalid token', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/some-uuid`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer bad-token',
        },
        body: JSON.stringify({ name: 'Alice' }),
      },
    );
    assert.equal(response.status, 401);
  });
});

// ---------------------------------------------------------------------------
// PUT /resources/api_user.php/id/:id – profile update (mocked db)
// ---------------------------------------------------------------------------

test('PUT /resources/api_user.php/id/:id returns 400 for empty name', async () => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: '   ' }),
      },
    );
    assert.equal(response.status, 400);
  });
});

test('PUT /resources/api_user.php/id/:id returns 400 when no fields provided', async () => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      },
    );
    assert.equal(response.status, 400);
  });
});

test('PUT /resources/api_user.php/id/:id updates name successfully', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({ rows: [], rowCount: 1 }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'Alice Updated' }),
      },
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.affected_rows, 1);
  });
});

test('PUT /resources/api_user.php/id/:id returns 404 when user not found', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({ rows: [], rowCount: 0 }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'Alice' }),
      },
    );
    assert.equal(response.status, 404);
  });
});

test('PUT /resources/api_user.php/id/:id returns 409 when new email already in use', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({ rows: [{ id: 'other-user' }] }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: 'taken@example.com' }),
      },
    );
    assert.equal(response.status, 409);
  });
});

test('PUT /resources/api_user.php/id/:id returns 400 for short password', async () => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: 'short' }),
      },
    );
    assert.equal(response.status, 400);
  });
});

test('PUT /resources/api_user.php/id/:id updates password successfully', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({ rows: [], rowCount: 1 }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_user.php/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: 'newPassword123' }),
      },
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
  });
});

// ---------------------------------------------------------------------------
// /resources/api_cart.php – authenticated cart operations (mocked db)
// ---------------------------------------------------------------------------

test('GET /resources/api_cart.php returns only the authenticated user cart', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const calls = [];

  t.mock.method(db, 'query', async (sql, params) => {
    calls.push({ sql, params });
    return {
      rows: [{
        id: 'cart-1',
        user_id: userId,
        book_id: 'My Book::1',
        book_title: 'My Book',
        volume: '1',
        cover: '/covers/my-book.jpg',
        price: '12.90',
        quantity: 2,
      }],
    };
  });

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/resources/api_cart.php?user_id=other-user`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.length, 1);
    assert.equal(payload[0].user_id, userId);
    assert.equal(payload[0].book_title, 'My Book');
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM cart_items WHERE user_id = \$1/);
  assert.deepEqual(calls[0].params, [userId]);
});

test('GET /resources/api_cart.php returns 401 without Authorization header', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_cart.php`);
    assert.equal(response.status, 401);
  });
});

test('POST /resources/api_cart.php adds a cart item with server-derived catalog data', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const calls = [];

  t.mock.method(db, 'query', async (sql, params) => {
    calls.push({ sql, params });
    return {
      rows: [{
        id: 'cart-1',
        user_id: params[0],
        book_id: params[1],
        book_title: params[2],
        volume: params[3],
        cover: params[4],
        price: String(params[5]),
        quantity: params[6],
      }],
    };
  });

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_cart.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: 'other-user',
        book_title: 'One Piece',
        volume: '1',
        cover: '/covers/tampered.jpg',
        price: '0.01',
        quantity: 2,
      }),
    });

    assert.equal(response.status, 201);

    const payload = await response.json();
    assert.equal(payload.user_id, userId);
    assert.equal(payload.book_id, 'One Piece::1');
    assert.equal(payload.book_title, 'One Piece');
    assert.equal(payload.cover, 'images/one_piece_vol_1.jpg');
    assert.equal(payload.price, '30');
    assert.equal(payload.quantity, 2);
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO cart_items/);
  assert.equal(calls[0].params[0], userId);
  assert.equal(calls[0].params[1], 'One Piece::1');
  assert.equal(calls[0].params[2], 'One Piece');
  assert.equal(calls[0].params[4], 'images/one_piece_vol_1.jpg');
  assert.equal(calls[0].params[5], 30);
});

test('POST /resources/api_cart.php returns 404 when the catalog item does not exist', async (t) => {
  const token = makeToken('user-uuid-1');

  t.mock.method(db, 'query', async () => {
    throw new Error('db.query should not be called for missing catalog items');
  });

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_cart.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        book_title: 'Unknown Book',
        volume: '99',
        quantity: 1,
      }),
    });

    assert.equal(response.status, 404);
  });
});

test('PUT /resources/api_cart.php/:id updates an owned cart item', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({
    rows: [{
      id: 'cart-1',
      user_id: userId,
      book_id: 'My Book::1',
      book_title: 'My Book',
      volume: '1',
      cover: '/covers/my-book.jpg',
      price: '12.90',
      quantity: 3,
    }],
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_cart.php/cart-1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quantity: 3 }),
    });

    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.quantity, 3);
  });
});

test('PUT /resources/api_cart.php/:id returns 404 for another user cart item', async (t) => {
  const token = makeToken('user-uuid-1');

  t.mock.method(db, 'query', async () => ({ rows: [], rowCount: 0 }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_cart.php/cart-1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quantity: 3 }),
    });

    assert.equal(response.status, 404);
  });
});

test('DELETE /resources/api_cart.php/:id deletes an owned cart item', async (t) => {
  const token = makeToken('user-uuid-1');

  t.mock.method(db, 'query', async () => ({ rowCount: 1 }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_cart.php/cart-1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.affected_rows, 1);
  });
});

test('DELETE /resources/api_cart.php/:id returns 404 for another user cart item', async (t) => {
  const token = makeToken('user-uuid-1');

  t.mock.method(db, 'query', async () => ({ rowCount: 0 }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_cart.php/cart-1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 404);
  });
});

// ---------------------------------------------------------------------------
// /resources/api_orders.php – authenticated checkout from owned cart items
// ---------------------------------------------------------------------------

test('POST /resources/api_orders.php returns 401 without Authorization header', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_orders.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_item_ids: ['11111111-1111-4111-8111-111111111111'] }),
    });

    assert.equal(response.status, 401);
  });
});

test('POST /resources/api_orders.php creates an order from owned cart items only', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const cartItemId = '11111111-1111-4111-8111-111111111111';
  const calls = [];

  t.mock.method(db, 'query', async (sql, params) => {
    calls.push({ sql, params });

    if (sql === 'BEGIN' || sql === 'COMMIT') {
      return { rows: [], rowCount: null };
    }

    if (sql.includes('FROM cart_items')) {
      return {
        rows: [{
          id: cartItemId,
          book_id: 'One Piece::1',
          title: 'One Piece',
          volume: '1',
          cover: 'images/one_piece_vol_1.jpg',
          unit_price: '30.00',
          quantity: 2,
        }],
        rowCount: 1,
      };
    }

    if (sql.includes('INSERT INTO orders')) {
      return {
        rows: [{ id: '22222222-2222-4222-8222-222222222222' }],
        rowCount: 1,
      };
    }

    if (sql.includes('INSERT INTO order_items')) {
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('DELETE FROM cart_items')) {
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_orders.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: 'other-user',
        items: [{ id: 'tampered', price: 0 }],
        cart_item_ids: [cartItemId],
      }),
    });

    assert.equal(response.status, 201);

    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.id, '22222222-2222-4222-8222-222222222222');
  });

  assert.equal(calls[1].params[0], userId);
  assert.deepEqual(calls[1].params[1], [cartItemId]);
  assert.equal(calls[2].params[0], userId);
  assert.equal(calls[2].params[1], 60);
});

test('POST /resources/api_orders.php returns 404 when any cart item is not owned by the user', async (t) => {
  const token = makeToken('user-uuid-1');
  const cartItemId = '11111111-1111-4111-8111-111111111111';
  const calls = [];

  t.mock.method(db, 'query', async (sql, params) => {
    calls.push({ sql, params });

    if (sql === 'BEGIN' || sql === 'ROLLBACK') {
      return { rows: [], rowCount: null };
    }

    if (sql.includes('FROM cart_items')) {
      return { rows: [], rowCount: 0 };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_orders.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ cart_item_ids: [cartItemId] }),
    });

    assert.equal(response.status, 404);
  });

  assert.equal(calls[0].sql, 'BEGIN');
  assert.equal(calls[2].sql, 'ROLLBACK');
});

test('POST /resources/api_orders.php rolls back and returns 500 when inserting order items fails', async (t) => {
  const token = makeToken('user-uuid-1');
  const cartItemId = '11111111-1111-4111-8111-111111111111';
  const calls = [];

  t.mock.method(db, 'query', async (sql, params) => {
    calls.push({ sql, params });

    if (sql === 'BEGIN' || sql === 'ROLLBACK') {
      return { rows: [], rowCount: null };
    }

    if (sql.includes('FROM cart_items')) {
      return {
        rows: [{
          id: cartItemId,
          book_id: 'One Piece::1',
          title: 'One Piece',
          unit_price: '30.00',
          quantity: 1,
        }],
        rowCount: 1,
      };
    }

    if (sql.includes('INSERT INTO orders')) {
      return {
        rows: [{ id: '22222222-2222-4222-8222-222222222222' }],
        rowCount: 1,
      };
    }

    if (sql.includes('INSERT INTO order_items')) {
      throw new Error('order_items insert failed');
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_orders.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ cart_item_ids: [cartItemId] }),
    });

    assert.equal(response.status, 500);
  });

  assert.equal(calls[0].sql, 'BEGIN');
  assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
  assert.equal(calls.some((call) => call.sql === 'COMMIT'), false);
  assert.equal(calls.some((call) => call.sql.includes('DELETE FROM cart_items')), false);
});

test('GET /resources/api_orders.php returns authenticated user purchase history ordered by purchase date', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const calls = [];

  t.mock.method(db, 'query', async (sql, params) => {
    calls.push({ sql, params });

    if (sql.includes('FROM orders')) {
      return {
        rows: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            user_id: userId,
            total_amount: '60.00',
            status: 'completed',
            created_at: '2026-01-02T00:00:00.000Z',
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            user_id: userId,
            total_amount: '30.00',
            status: 'completed',
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        rowCount: 2,
      };
    }

    if (sql.includes('FROM order_items')) {
      return {
        rows: [
          {
            id: 'item-1',
            order_id: '33333333-3333-4333-8333-333333333333',
            book_id: 'One Piece::2',
            title: 'One Piece',
            unit_price: '30.00',
            quantity: 2,
            line_total: '60.00',
          },
          {
            id: 'item-2',
            order_id: '22222222-2222-4222-8222-222222222222',
            book_id: 'One Piece::1',
            title: 'One Piece',
            unit_price: '30.00',
            quantity: 1,
            line_total: '30.00',
          },
        ],
        rowCount: 2,
      };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/resources/api_orders.php?user_id=someone-else`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.length, 2);
    assert.equal(payload.data[0].id, '33333333-3333-4333-8333-333333333333');
    assert.equal(payload.data[0].purchase_date, '2026-01-02T00:00:00.000Z');
    assert.equal(payload.data[0].items.length, 1);
    assert.equal(payload.data[0].items[0].book_title, 'One Piece');
    assert.equal(payload.data[0].items[0].volume, '2');
    assert.equal(payload.data[0].items[0].price, '30.00');
    assert.equal(payload.data[1].id, '22222222-2222-4222-8222-222222222222');
    assert.equal(payload.data[1].items.length, 1);
  });

  assert.deepEqual(calls[0].params, [userId]);
  assert.equal(calls[0].sql.includes('WHERE user_id = $1'), true);
  assert.ok(calls[0].sql.includes('ORDER BY created_at DESC'));
});

test('reset password template shows success before logged-out warning after password change', () => {
  const resetComponentPath = path.join(__dirname, '..', '..', 'js', 'components', 'app-reset-password.js');
  const source = fs.readFileSync(resetComponentPath, 'utf8');

  const submittedBranch = source.indexOf('v-if="submitted"');
  const loggedOutBranch = source.indexOf('v-else-if="!authState.isLoggedIn"');

  assert.notEqual(submittedBranch, -1, 'template should have an explicit submitted success branch');
  assert.notEqual(loggedOutBranch, -1, 'template should still show a logged-out warning branch');
  assert.ok(submittedBranch < loggedOutBranch, 'submitted branch must be evaluated before logged-out warning');
});
