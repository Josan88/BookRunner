'use strict';

// Set JWT_SECRET before loading the app so token signing works in tests
process.env.JWT_SECRET = 'test-secret-for-unit-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
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
