'use strict';

// Set JWT_SECRET before loading the app so token signing works in tests
process.env.JWT_SECRET = 'test-secret-for-unit-tests';
process.env.FRONTEND_ORIGIN = 'http://localhost:8080, https://frontend.example.com';

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

test('GET /health sets CORS headers for allowed origin', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Origin: 'http://localhost:8080' },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:8080');
    assert.equal(response.headers.get('vary'), 'Origin');
  });
});

test('OPTIONS preflight allows configured origin and auth/content-type headers', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/users`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://frontend.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://frontend.example.com');
    assert.equal(
      response.headers.get('access-control-allow-methods'),
      'GET,POST,PUT,DELETE,OPTIONS',
    );
    assert.match(response.headers.get('access-control-allow-headers') || '', /Authorization/i);
    assert.match(response.headers.get('access-control-allow-headers') || '', /Content-Type/i);
    assert.equal(response.headers.get('access-control-max-age'), '600');
  });
});

test('OPTIONS preflight rejects disallowed origins', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/users`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://malicious.example.com',
        'Access-Control-Request-Method': 'POST',
      },
    });

    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });
});

test('startup migration adds missing books columns with IF NOT EXISTS', async (t) => {
  const calls = [];
  t.mock.method(db, 'connect', async () => ({
    query: async (sql) => {
      calls.push(sql);
      return { rows: [] };
    },
    release: () => {},
  }));

  await app.runStartupMigrations();

  assert.equal(calls.length, 3);
  assert.equal(calls[0], 'BEGIN');
  assert.match(calls[1], /ALTER TABLE books ADD COLUMN IF NOT EXISTS volume VARCHAR\(50\)/i);
  assert.match(calls[1], /ALTER TABLE books ADD COLUMN IF NOT EXISTS cover TEXT/i);
  assert.match(calls[1], /ALTER TABLE books ADD COLUMN IF NOT EXISTS keywords TEXT/i);
  assert.match(calls[1], /ALTER TABLE books ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 0/i);
  assert.match(calls[1], /ALTER TABLE books ADD COLUMN IF NOT EXISTS release_date VARCHAR\(20\)/i);
  assert.match(calls[1], /ALTER TABLE books ADD COLUMN IF NOT EXISTS book_id VARCHAR\(120\)/i);
  assert.match(calls[1], /UPDATE books[\s\S]*SET volume = 'Vol ' \|\| COALESCE\(/i);
  assert.match(calls[1], /SUBSTRING\(cover FROM '_vol_\(\[0-9\]\+\)'/i);
  assert.match(calls[1], /SUBSTRING\(book_id FROM '\(\[0-9\]\+\)\$'/i);
  assert.match(calls[1], /WHERE volume IS NULL OR BTRIM\(volume\) = ''/i);
  assert.match(
    calls[1],
    /ALTER TABLE cart_items[\s\S]*ALTER COLUMN book_id TYPE VARCHAR\(120\) USING book_id::text/i,
  );
  assert.match(
    calls[1],
    /ALTER TABLE order_items[\s\S]*ALTER COLUMN book_id TYPE VARCHAR\(120\) USING book_id::text/i,
  );
  assert.match(calls[1], /ALTER TABLE order_items[\s\S]*ADD COLUMN IF NOT EXISTS cover TEXT NOT NULL DEFAULT ''/i);
  assert.match(calls[1], /UPDATE order_items AS oi[\s\S]*SET cover = b\.cover/i);
  assert.match(calls[1], /FROM books AS b[\s\S]*WHERE oi\.book_id = b\.book_id/i);
  assert.match(calls[1], /oi\.cover = ''/i);
  assert.match(calls[1], /NULLIF\(BTRIM\(b\.cover\), ''\) IS NOT NULL/i);
  assert.match(calls[1], /UPDATE books AS b SET\s+cover = v\.cover,/i);
  assert.match(calls[1], /FROM \(VALUES/i);
  assert.match(calls[1], /WHERE b\.title = v\.title\s+AND b\.volume = v\.volume/i);
  assert.match(calls[1], /b\.cover IS NULL OR BTRIM\(b\.cover\) = ''/i);
  assert.equal(calls[2], 'COMMIT');
});

test('startup migration logs error and rolls back transaction when migration fails', async (t) => {
  const calls = [];
  t.mock.method(db, 'connect', async () => ({
    query: async (sql) => {
      calls.push(sql);
      if (sql === 'BEGIN') {
        return { rows: [] };
      }
      if (sql === 'ROLLBACK') {
        return { rows: [] };
      }
      throw new Error('migration failed');
    },
    release: () => {},
  }));
  const consoleErrorMock = t.mock.method(console, 'error', () => {});

  await app.runStartupMigrations();

  assert.equal(calls[0], 'BEGIN');
  assert.equal(calls[2], 'ROLLBACK');
  assert.equal(consoleErrorMock.mock.calls.length, 1);
  const [firstCall] = consoleErrorMock.mock.calls;
  const [firstMessage] = firstCall.arguments;
  assert.match(String(firstMessage), /Startup books schema migration failed/);
});

test('GET /api/books returns 200 when a row has null volume', async (t) => {
  t.mock.method(db, 'queryRead', async () => ({
    rows: [{
      book_id: 'book-1',
      title: 'Solo Leveling',
      author: 'Chugong',
      genre: 'Action, Fantasy',
      description: 'Desc',
      price: '39.90',
      volume: null,
      cover: '/images/solo.jpg',
      type: 'Manga',
      publisher: 'Yen Press',
      keywords: 'Bestsellers, Popular',
      page_count: 200,
      release_date: '2025-01-01',
    }],
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/books`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(Array.isArray(payload), true);
    assert.equal(payload.length, 1);
    assert.equal(payload[0].title, 'Solo Leveling');
    assert.equal(payload[0].volumes[0].volumeNumber, null);
  });
});

test('GET /api/books returns 200 when genre is an array', async (t) => {
  t.mock.method(db, 'queryRead', async () => ({
    rows: [{
      book_id: 'book-genre-array',
      title: 'Array Genre Book',
      author: 'Author',
      genre: [' Action ', 'Fantasy', 7],
      description: 'Desc',
      price: '12.50',
      volume: 'Vol 1',
      cover: '/images/array-genre.jpg',
      type: 'Manga',
      publisher: 'Publisher',
      keywords: 'Tag 1, Tag 2',
      page_count: 180,
      release_date: '2025-03-01',
    }],
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/books`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload[0].genre, ['Action', 'Fantasy', '7']);
  });
});

test('GET /api/books returns 200 when keywords is an array', async (t) => {
  t.mock.method(db, 'queryRead', async () => ({
    rows: [{
      book_id: 'book-keywords-array',
      title: 'Array Keywords Book',
      author: 'Author',
      genre: 'Action, Fantasy',
      description: 'Desc',
      price: '15.00',
      volume: 'Vol 2',
      cover: '/images/array-keywords.jpg',
      type: 'Manga',
      publisher: 'Publisher',
      keywords: [' Popular ', ' New ', 42],
      page_count: 190,
      release_date: '2025-04-01',
    }],
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/books`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload[0].keywords, ['Popular', 'New', '42']);
  });
});

test('GET /api/books accepts X-Forwarded-For header', async (t) => {
  t.mock.method(db, 'queryRead', async () => ({
    rows: [{
      book_id: 'book-forwarded-for',
      title: 'Forwarded Header Book',
      author: 'Author',
      genre: 'Action',
      description: 'Desc',
      price: '18.00',
      volume: 'Vol 1',
      cover: '/images/forwarded-header.jpg',
      type: 'Manga',
      publisher: 'Publisher',
      keywords: 'Popular',
      page_count: 210,
      release_date: '2025-05-01',
    }],
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/books`, {
      headers: { 'X-Forwarded-For': '203.0.113.10' },
    });

    assert.equal(response.status, 200);
  });
});

test('GET /api/books falls back to legacy query when newer books columns are missing', async (t) => {
  const calls = [];

  t.mock.method(db, 'queryRead', async (sql) => {
    calls.push(sql);

    if (calls.length === 1) {
      const err = new Error('column "book_id" does not exist');
      err.code = '42703';
      throw err;
    }

    return {
      rows: [{
        title: 'Legacy Book',
        author: 'Legacy Author',
        genre: 'Adventure',
        description: 'Legacy Desc',
        price: '9.99',
        volume: 'Vol 1',
        cover: '/images/legacy.jpg',
        type: 'Manga',
        publisher: 'Legacy Publisher',
        keywords: 'Bestsellers, Popular',
        page_count: 212,
        release_date: '2025-02-10',
      }],
    };
  });

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/books`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload[0].title, 'Legacy Book');
    assert.equal(payload[0].volumes[0].volumeNumber, 1);
    assert.equal(payload[0].volumes[0].page_count, 212);
    assert.equal(payload[0].volumes[0].release_date, '2025-02-10');
    assert.deepEqual(payload[0].keywords, ['Bestsellers', 'Popular']);
  });

  assert.match(calls[0], /SELECT book_id/);
  assert.doesNotMatch(calls[1], /SELECT[\s\S]*\bbook_id\b/i);
  assert.match(calls[1], /\bkeywords\b/);
  assert.match(calls[1], /\bpage_count\b/);
  assert.match(calls[1], /\brelease_date\b/);
});

test('GET /api/books falls back to no-volume legacy query when volume is also missing', async (t) => {
  const calls = [];

  t.mock.method(db, 'queryRead', async (sql) => {
    calls.push(sql);

    if (calls.length <= 4) {
      const err = new Error('column does not exist');
      err.code = '42703';
      throw err;
    }

    return {
      rows: [{
        title: 'Legacy Book',
        author: 'Legacy Author',
        genre: 'Adventure',
        description: 'Legacy Desc',
        price: '9.99',
        cover: '/images/legacy.jpg',
        type: 'Manga',
        publisher: 'Legacy Publisher',
      }],
    };
  });

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/books`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload[0].volumes[0].volumeNumber, null);
  });

  assert.match(calls[0], /SELECT book_id/);
  assert.doesNotMatch(calls[1], /SELECT[\s\S]*\bbook_id\b/i);
  assert.match(calls[1], /\bkeywords\b/);
  assert.match(calls[1], /ORDER BY title ASC, volume ASC/);
  assert.doesNotMatch(calls[2], /SELECT[\s\S]*\bbook_id\b/i);
  assert.doesNotMatch(calls[2], /\bkeywords\b/);
  assert.match(calls[2], /ORDER BY title ASC, volume ASC/);
  assert.doesNotMatch(calls[3], /SELECT[\s\S]*\bcover\b/i);
  assert.match(calls[3], /ORDER BY title ASC, volume ASC/);
  assert.doesNotMatch(calls[4], /SELECT[\s\S]*\bvolume\b/i);
  assert.match(calls[4], /ORDER BY title ASC$/);
});

test('GET /api/books falls back to no-cover legacy query when cover is missing', async (t) => {
  const calls = [];

  t.mock.method(db, 'queryRead', async (sql) => {
    calls.push(sql);

    if (calls.length <= 3) {
      const err = new Error('column "cover" does not exist');
      err.code = '42703';
      throw err;
    }

    return {
      rows: [{
        title: 'Legacy Book',
        author: 'Legacy Author',
        genre: 'Adventure',
        description: 'Legacy Desc',
        price: '9.99',
        volume: 'Vol 2',
        type: 'Manga',
        publisher: 'Legacy Publisher',
      }],
    };
  });

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/books`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload[0].volumes[0].volumeNumber, 2);
    assert.equal(payload[0].volumes[0].cover, null);
  });

  assert.match(calls[0], /\bcover\b/);
  assert.match(calls[1], /\bcover\b/);
  assert.match(calls[2], /\bcover\b/);
  assert.doesNotMatch(calls[3], /SELECT[\s\S]*\bcover\b/i);
  assert.match(calls[3], /ORDER BY title ASC, volume ASC/);
});

// ---------------------------------------------------------------------------
// POST /api/users – input validation (no database required)
// ---------------------------------------------------------------------------

test('POST /api/users returns 400 when body is empty', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.ok(payload.error, 'should return an error message');
  });
});

test('POST /api/users returns 400 when password is missing', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com' }),
      },
    );
    assert.equal(response.status, 400);
  });
});

test('POST /api/users returns 400 when email is missing', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'secret' }),
      },
    );
    assert.equal(response.status, 400);
  });
});

test('POST /api/users returns 400 when name is present but empty (registration)', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users`,
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
// POST /api/users – registration (mocked db)
// ---------------------------------------------------------------------------

test('POST /api/users registers a new user successfully', async (t) => {
  t.mock.method(db, 'query', async (sql) => {
    // Email-check SELECT returns empty; INSERT returns nothing meaningful
    if (sql.includes('SELECT')) return { rows: [] };
    return { rows: [], rowCount: 1 };
  });

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users`,
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

test('POST /api/users returns 409 when email already registered', async (t) => {
  t.mock.method(db, 'query', async () => {
    return { rows: [{ id: 'existing-id' }] };
  });

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users`,
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
// POST /api/users – login (mocked db)
// ---------------------------------------------------------------------------

test('POST /api/users logs in and returns a JWT', async (t) => {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('correctpassword', 4); // low rounds for speed

  t.mock.method(db, 'query', async () => ({
    rows: [{ id: 'user-uuid-1', name: 'Alice', email: 'alice@example.com', password_hash: hash }],
  }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users`,
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

test('POST /api/users returns 401 for wrong password', async (t) => {
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('correctpassword', 4);

  t.mock.method(db, 'query', async () => ({
    rows: [{ id: 'user-uuid-1', name: 'Alice', email: 'alice@example.com', password_hash: hash }],
  }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alice@example.com', password: 'wrongpassword' }),
      },
    );
    assert.equal(response.status, 401);
  });
});

test('POST /api/users returns 401 when user not found', async (t) => {
  t.mock.method(db, 'query', async () => ({ rows: [] }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'nobody@example.com', password: 'password' }),
      },
    );
    assert.equal(response.status, 401);
  });
});

test('POST /api/users returns JSON 500 when database query fails', async (t) => {
  t.mock.method(db, 'query', async () => {
    throw new Error('database unavailable');
  });

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users`,
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
// GET /api/users/id/:id – auth required (no database required)
// ---------------------------------------------------------------------------

test('GET /api/users/id/:id returns 401 without Authorization header', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/some-uuid`,
    );
    assert.equal(response.status, 401);
  });
});

test('GET /api/users/id/:id returns 401 with invalid token', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/some-uuid`,
      { headers: { Authorization: 'Bearer not-a-valid-jwt' } },
    );
    assert.equal(response.status, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/id/:id – authenticated profile fetch (mocked db)
// ---------------------------------------------------------------------------

test('GET /api/users/id/:id returns 403 when token user != path user', async () => {
  const token = makeToken('other-uuid');

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/target-uuid`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 403);
  });
});

test('GET /api/users/id/:id returns 200 with own profile', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({
    rows: [{ id: userId, name: 'Alice', email: 'alice@example.com', created_at: new Date().toISOString() }],
  }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/${userId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, userId);
    assert.equal(payload.name, 'Alice');
  });
});

test('GET /api/users/id/:id returns 404 when user not found', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({ rows: [] }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/${userId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 404);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/id/:id – auth required (no database required)
// ---------------------------------------------------------------------------

test('PUT /api/users/id/:id returns 401 without Authorization header', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/some-uuid`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' }),
      },
    );
    assert.equal(response.status, 401);
  });
});

test('PUT /api/users/id/:id returns 401 with invalid token', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/some-uuid`,
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
// PUT /api/users/id/:id – profile update (mocked db)
// ---------------------------------------------------------------------------

test('PUT /api/users/id/:id returns 400 for empty name', async () => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: '   ' }),
      },
    );
    assert.equal(response.status, 400);
  });
});

test('PUT /api/users/id/:id returns 400 when no fields provided', async () => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      },
    );
    assert.equal(response.status, 400);
  });
});

test('PUT /api/users/id/:id updates name successfully', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({ rows: [], rowCount: 1 }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/${userId}`,
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

test('PUT /api/users/id/:id returns 404 when user not found', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({ rows: [], rowCount: 0 }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'Alice' }),
      },
    );
    assert.equal(response.status, 404);
  });
});

test('PUT /api/users/id/:id returns 409 when new email already in use', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({ rows: [{ id: 'other-user' }] }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: 'taken@example.com' }),
      },
    );
    assert.equal(response.status, 409);
  });
});

test('PUT /api/users/id/:id returns 400 for short password', async () => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/${userId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: 'short' }),
      },
    );
    assert.equal(response.status, 400);
  });
});

test('PUT /api/users/id/:id updates password successfully', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'query', async () => ({ rows: [], rowCount: 1 }));

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/users/id/${userId}`,
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
// /api/cart – authenticated cart operations (mocked db)
// ---------------------------------------------------------------------------

test('GET /api/cart returns only the authenticated user cart', async (t) => {
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
      `http://127.0.0.1:${port}/api/cart?user_id=other-user`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.length, 1);
    assert.equal(payload[0].user_id, userId);
    assert.equal(payload[0].book_title, 'My Book');
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM cart_items/);
  assert.match(calls[0].sql, /GROUP BY user_id, book_id/);
  assert.match(calls[0].sql, /SUM\(quantity\)/);
  assert.deepEqual(calls[0].params, [userId]);
});

test('GET /api/cart returns 401 without Authorization header', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cart`);
    assert.equal(response.status, 401);
  });
});

test('POST /api/cart adds a cart item with server-derived catalog data', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const catalogCalls = [];
  const writeCalls = [];

  t.mock.method(db, 'queryRead', async (sql, params) => {
    catalogCalls.push({ sql, params });
    if (/SELECT[\s\S]*FROM books/i.test(sql)) {
      return {
        rows: [{
          book_id: 'OP001',
          title: 'One Piece',
          volume: 'Vol 1',
          cover: 'images/one_piece_vol_1.jpg',
          price: 30,
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  t.mock.method(db, 'connect', async () => ({
    query: async (sql, params) => {
      writeCalls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null };
      }
      if (/SELECT pg_advisory_xact_lock/i.test(sql)) {
        return { rows: [{ pg_advisory_xact_lock: null }] };
      }
      if (/SELECT id, quantity[\s\S]*FOR UPDATE/i.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO cart_items/i.test(sql)) {
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
      }
      throw new Error(`Unexpected client SQL: ${sql}`);
    },
    release: () => {},
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cart`, {
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
    assert.equal(payload.book_id, 'OP001');
    assert.equal(payload.book_title, 'One Piece');
    assert.equal(payload.cover, 'images/one_piece_vol_1.jpg');
    assert.equal(payload.price, '30');
    assert.equal(payload.quantity, 2);
  });

  assert.equal(catalogCalls.length, 1);
  assert.match(catalogCalls[0].sql, /SELECT[\s\S]*FROM books/i);
  assert.equal(writeCalls[0].sql, 'BEGIN');
  assert.match(writeCalls[1].sql, /SELECT pg_advisory_xact_lock/i);
  assert.match(writeCalls[2].sql, /SELECT id, quantity[\s\S]*FOR UPDATE/i);
  assert.match(writeCalls[3].sql, /INSERT INTO cart_items/);
  assert.doesNotMatch(writeCalls[3].sql, /ON CONFLICT/);
  assert.equal(writeCalls[3].params[0], userId);
  assert.equal(writeCalls[3].params[1], 'OP001');
  assert.equal(writeCalls[3].params[2], 'One Piece');
  assert.equal(writeCalls[3].params[4], 'images/one_piece_vol_1.jpg');
  assert.equal(writeCalls[3].params[5], 30);
  assert.equal(writeCalls[4].sql, 'COMMIT');
});

test('POST /api/cart returns 404 when catalog book_id is null', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'queryRead', async (sql) => {
    if (/SELECT[\s\S]*FROM books/i.test(sql)) {
      return {
        rows: [{
          book_id: null,
          title: 'Classroom of the Elite',
          volume: 'Vol 1',
          cover: 'images/cote_vol_1.jpg',
          price: 14,
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  t.mock.method(db, 'connect', async () => ({
    query: async () => { throw new Error('Should not reach transaction'); },
    release: () => {},
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        book_title: 'Classroom of the Elite',
        volume: '1',
        quantity: 1,
      }),
    });

    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.error, 'Book not found');
  });
});

test('POST /api/cart succeeds when catalog book cover is null', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);

  t.mock.method(db, 'queryRead', async (sql) => {
    if (/SELECT[\s\S]*FROM books/i.test(sql)) {
      return {
        rows: [{
          book_id: 'COTE001',
          title: 'Classroom of the Elite',
          volume: 'Vol 1',
          cover: null,
          price: 14,
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  t.mock.method(db, 'connect', async () => ({
    query: async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null };
      }
      if (/SELECT pg_advisory_xact_lock/i.test(sql)) {
        return { rows: [{ pg_advisory_xact_lock: null }] };
      }
      if (/SELECT id, quantity[\s\S]*FOR UPDATE/i.test(sql)) {
        return { rows: [] };
      }
      if (/INSERT INTO cart_items/i.test(sql)) {
        return {
          rows: [{
            id: 'cart-null-cover',
            user_id: params[0],
            book_id: params[1],
            book_title: params[2],
            volume: params[3],
            cover: params[4],
            price: String(params[5]),
            quantity: params[6],
          }],
        };
      }
      throw new Error(`Unexpected client SQL: ${sql}`);
    },
    release: () => {},
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        book_title: 'Classroom of the Elite',
        volume: '1',
        quantity: 1,
      }),
    });

    assert.equal(response.status, 201);

    const payload = await response.json();
    assert.equal(payload.book_title, 'Classroom of the Elite');
    assert.equal(payload.cover, '');
  });
});

test('POST /api/cart serializes concurrent writes for the same cart key', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const rowState = [];
  let lockHeld = false;
  let lockReleased = Promise.resolve();
  let nextId = 1;

  t.mock.method(db, 'queryRead', async (sql) => {
    if (/SELECT[\s\S]*FROM books/i.test(sql)) {
      return {
        rows: [{
          book_id: 'OP001',
          title: 'One Piece',
          volume: 'Vol 1',
          cover: 'images/one_piece_vol_1.jpg',
          price: 30,
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  t.mock.method(db, 'connect', async () => {
    let releaseLock = null;
    return {
      query: async (sql, params) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          if ((sql === 'COMMIT' || sql === 'ROLLBACK') && releaseLock) {
            releaseLock();
            releaseLock = null;
          }
          return { rows: [], rowCount: null };
        }

        if (/SELECT pg_advisory_xact_lock/i.test(sql)) {
          while (lockHeld) {
            await lockReleased;
          }
          lockHeld = true;
          lockReleased = new Promise((resolve) => {
            releaseLock = () => {
              lockHeld = false;
              resolve();
            };
          });
          return { rows: [{ pg_advisory_xact_lock: null }] };
        }

        if (/SELECT id, quantity[\s\S]*FOR UPDATE/i.test(sql)) {
          return {
            rows: rowState
              .filter((row) => row.user_id === params[0] && row.book_id === params[1])
              .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))
              .map((row) => ({ id: row.id, quantity: row.quantity })),
          };
        }

        if (/INSERT INTO cart_items/i.test(sql)) {
          const row = {
            id: `cart-${nextId++}`,
            user_id: params[0],
            book_id: params[1],
            book_title: params[2],
            volume: params[3],
            cover: params[4],
            price: String(params[5]),
            quantity: params[6],
            created_at: new Date(`2026-01-01T00:00:0${nextId}Z`),
          };
          rowState.push(row);
          return { rows: [row] };
        }

        if (/UPDATE cart_items/i.test(sql)) {
          const row = rowState.find((item) => item.id === params[1]);
          row.quantity = params[0];
          return { rows: [row] };
        }

        if (/DELETE FROM cart_items/i.test(sql)) {
          return { rows: [], rowCount: 0 };
        }

        throw new Error(`Unexpected client SQL: ${sql}`);
      },
      release: () => {
        if (releaseLock) {
          releaseLock();
          releaseLock = null;
        }
      },
    };
  });

  await withServer(async (port) => {
    const [first, second] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/api/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          book_title: 'One Piece',
          volume: '1',
          quantity: 2,
        }),
      }),
      fetch(`http://127.0.0.1:${port}/api/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          book_title: 'One Piece',
          volume: '1',
          quantity: 3,
        }),
      }),
    ]);

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
  });

  assert.equal(rowState.length, 1);
  assert.equal(rowState[0].quantity, 5);
});

test('POST /api/cart returns 404 when the catalog item does not exist', async (t) => {
  const token = makeToken('user-uuid-1');

  t.mock.method(db, 'queryRead', async () => {
    return { rows: [] };
  });

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cart`, {
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

test('POST /api/cart increments quantity for existing cart rows', async (t) => {
  const token = makeToken('user-uuid-1');
  const catalogCalls = [];
  const writeCalls = [];

  t.mock.method(db, 'queryRead', async (sql, params) => {
    catalogCalls.push({ sql, params });

    if (/SELECT[\s\S]*FROM books/i.test(sql)) {
      return {
        rows: [{
          book_id: 'OP001',
          title: 'One Piece',
          volume: 'Vol 1',
          cover: 'images/one_piece_vol_1.jpg',
          price: 30,
        }],
      };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  t.mock.method(db, 'connect', async () => ({
    query: async (sql, params) => {
      writeCalls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null };
      }
      if (/SELECT pg_advisory_xact_lock/i.test(sql)) {
        return { rows: [{ pg_advisory_xact_lock: null }] };
      }
      if (/SELECT id, quantity[\s\S]*FOR UPDATE/i.test(sql)) {
        return {
          rows: [
            { id: 'cart-2', quantity: 3 },
            { id: 'cart-1', quantity: 2 },
          ],
        };
      }
      if (/UPDATE cart_items/i.test(sql)) {
        return {
          rows: [{
            id: 'cart-2',
            user_id: 'user-uuid-1',
            book_id: 'OP001',
            book_title: 'One Piece',
            volume: '1',
            cover: 'images/one_piece_vol_1.jpg',
            price: '30',
            quantity: params[0],
          }],
        };
      }
      if (/DELETE FROM cart_items/i.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected client SQL: ${sql}`);
    },
    release: () => {},
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        book_title: 'One Piece',
        volume: '1',
        quantity: 2,
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.quantity, 7);
  });

  assert.equal(catalogCalls.length, 1);
  assert.equal(writeCalls[0].sql, 'BEGIN');
  assert.match(writeCalls[2].sql, /SELECT id, quantity[\s\S]*FOR UPDATE/i);
  assert.match(writeCalls[3].sql, /UPDATE cart_items/);
  assert.equal(writeCalls[3].params[0], 7);
  assert.match(writeCalls[4].sql, /DELETE FROM cart_items/);
  assert.deepEqual(writeCalls[4].params, [['cart-1']]);
  assert.equal(writeCalls[5].sql, 'COMMIT');
});

test('POST /api/cart returns 500 when cart write fails', async (t) => {
  const token = makeToken('user-uuid-1');
  const calls = [];

  t.mock.method(db, 'queryRead', async (sql, params) => {
    calls.push({ sql, params });

    if (/SELECT[\s\S]*FROM books/i.test(sql)) {
      return {
        rows: [{
          book_id: 'OP001',
          title: 'One Piece',
          volume: 'Vol 1',
          cover: 'images/one_piece_vol_1.jpg',
          price: 30,
        }],
      };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  t.mock.method(db, 'connect', async () => ({
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null };
      }
      if (/SELECT pg_advisory_xact_lock/i.test(sql)) {
        throw new Error('cart write failed');
      }
      throw new Error(`Unexpected client SQL: ${sql}`);
    },
    release: () => {},
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        book_title: 'One Piece',
        volume: '1',
        quantity: 1,
      }),
    });

    assert.equal(response.status, 500);
  });

  assert.ok(calls.some((call) => call.sql === 'BEGIN'));
  assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
});

test('PUT /api/cart/:id updates an owned cart item', async (t) => {
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
    const response = await fetch(`http://127.0.0.1:${port}/api/cart/cart-1`, {
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

test('PUT /api/cart/:id returns 404 for another user cart item', async (t) => {
  const token = makeToken('user-uuid-1');

  t.mock.method(db, 'query', async () => ({ rows: [], rowCount: 0 }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cart/cart-1`, {
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

test('DELETE /api/cart/:id deletes an owned cart item', async (t) => {
  const token = makeToken('user-uuid-1');

  t.mock.method(db, 'query', async () => ({ rowCount: 1 }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cart/cart-1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.affected_rows, 1);
  });
});

test('DELETE /api/cart/:id returns 404 for another user cart item', async (t) => {
  const token = makeToken('user-uuid-1');

  t.mock.method(db, 'query', async () => ({ rowCount: 0 }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cart/cart-1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 404);
  });
});

// ---------------------------------------------------------------------------
// /api/orders – authenticated checkout from owned cart items
// ---------------------------------------------------------------------------

test('POST /api/orders returns 401 without Authorization header', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_item_ids: ['11111111-1111-4111-8111-111111111111'] }),
    });

    assert.equal(response.status, 401);
  });
});

test('POST /api/orders creates an order from owned cart items only', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const cartItemId = '11111111-1111-4111-8111-111111111111';
  const calls = [];

  t.mock.method(db, 'connect', async () => ({
    query: async (sql, params) => {
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
    },
    release: () => {},
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
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
  const orderItemsInsertCall = calls.find((call) => call.sql.includes('INSERT INTO order_items'));
  assert.ok(orderItemsInsertCall);
  assert.match(orderItemsInsertCall.sql, /INSERT INTO order_items \(order_id, book_id, title, cover, unit_price, quantity, line_total\)/);
  assert.equal(orderItemsInsertCall.params[3], 'images/one_piece_vol_1.jpg');
});

test('POST /api/orders returns 404 when any cart item is not owned by the user', async (t) => {
  const token = makeToken('user-uuid-1');
  const cartItemId = '11111111-1111-4111-8111-111111111111';
  const calls = [];

  t.mock.method(db, 'connect', async () => ({
    query: async (sql, params) => {
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null };
      }

      if (sql.includes('FROM cart_items')) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release: () => {},
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
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

test('POST /api/orders rolls back and returns 500 when inserting order items fails', async (t) => {
  const token = makeToken('user-uuid-1');
  const cartItemId = '11111111-1111-4111-8111-111111111111';
  const calls = [];

  t.mock.method(db, 'connect', async () => ({
    query: async (sql, params) => {
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
            cover: 'images/one_piece_vol_1.jpg',
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
    },
    release: () => {},
  }));

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
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

test('GET /api/orders returns authenticated user purchase history ordered by purchase date', async (t) => {
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
            cover: 'images/one_piece_vol_2.jpg',
            unit_price: '30.00',
            quantity: 2,
            line_total: '60.00',
          },
          {
            id: 'item-2',
            order_id: '22222222-2222-4222-8222-222222222222',
            book_id: 'One Piece::1',
            title: 'One Piece',
            cover: 'images/one_piece_vol_1.jpg',
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
    const response = await fetch(`http://127.0.0.1:${port}/api/orders?user_id=someone-else`, {
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
    assert.equal(payload.data[0].items[0].cover, 'images/one_piece_vol_2.jpg');
    assert.equal(payload.data[0].items[0].price, '30.00');
    assert.equal(payload.data[1].id, '22222222-2222-4222-8222-222222222222');
    assert.equal(payload.data[1].items.length, 1);
    assert.equal(payload.data[1].items[0].cover, 'images/one_piece_vol_1.jpg');
  });

  assert.deepEqual(calls[0].params, [userId]);
  assert.equal(calls[0].sql.includes('WHERE user_id = $1'), true);
  assert.ok(calls[0].sql.includes('ORDER BY created_at DESC'));
  assert.ok(calls[1].sql.includes('COALESCE(NULLIF(oi.cover, \'\'), b.cover, \'\') AS cover'));
  assert.ok(calls[1].sql.includes('LEFT JOIN books AS b ON b.book_id = oi.book_id'));
});

// ---------------------------------------------------------------------------
// /api/order-items – authenticated order item operations
// ---------------------------------------------------------------------------

test('PUT /api/order-items returns 401 without Authorization header', async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/order-items?id=item-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 2 }),
    });

    assert.equal(response.status, 401);
  });
});

test('PUT /api/order-items updates an owned order item quantity', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const calls = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [], rowCount: null };
      }

      if (sql.includes('UPDATE order_items AS oi')) {
        return {
          rows: [{
            id: 'item-1',
            order_id: 'order-1',
            quantity: 3,
            unit_price: '30.00',
            line_total: '90.00',
          }],
          rowCount: 1,
        };
      }

      if (sql.includes('UPDATE orders')) {
        return { rows: [{ total_amount: '120.00' }], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release: () => {
      released = true;
    },
  };

  t.mock.method(db, 'connect', async () => client);

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/order-items?id=item-1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quantity: 3 }),
    });

    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.affected_rows, 1);
    assert.equal(payload.data.quantity, 3);
    assert.equal(payload.data.order_total_amount, '120.00');
  });

  assert.equal(calls[0].sql, 'BEGIN');
  assert.match(calls[1].sql, /UPDATE order_items AS oi/);
  assert.match(calls[1].sql, /AND o.user_id = \$3/);
  assert.deepEqual(calls[1].params, [3, 'item-1', userId]);
  assert.match(calls[2].sql, /UPDATE orders/);
  assert.deepEqual(calls[2].params, ['order-1', userId]);
  assert.equal(calls[3].sql, 'COMMIT');
  assert.equal(released, true);
});

test('PUT /api/order-items returns 404 for another user item', async (t) => {
  const token = makeToken('user-uuid-1');
  const calls = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null };
      }
      if (sql.includes('UPDATE order_items AS oi')) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release: () => {
      released = true;
    },
  };

  t.mock.method(db, 'connect', async () => client);

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/order-items?id=item-1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quantity: 2 }),
    });

    assert.equal(response.status, 404);
  });

  assert.equal(calls[0].sql, 'BEGIN');
  assert.match(calls[1].sql, /UPDATE order_items AS oi/);
  assert.equal(calls[2].sql, 'ROLLBACK');
  assert.equal(released, true);
});

test('PUT /api/order-items returns 404 when order total update affects no rows', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const calls = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null };
      }
      if (sql.includes('UPDATE order_items AS oi')) {
        return {
          rows: [{
            id: 'item-1',
            order_id: 'order-1',
            quantity: 3,
            unit_price: '30.00',
            line_total: '90.00',
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('UPDATE orders')) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release: () => {
      released = true;
    },
  };

  t.mock.method(db, 'connect', async () => client);

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/order-items?id=item-1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quantity: 3 }),
    });

    assert.equal(response.status, 404);
  });

  assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
  assert.equal(released, true);
});

test('DELETE /api/order-items returns 401 without Authorization header', async () => {
  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/order-items?id=item-1&order_id=order-1`,
      { method: 'DELETE' },
    );

    assert.equal(response.status, 401);
  });
});

test('DELETE /api/order-items returns 404 for another user item', async (t) => {
  const token = makeToken('user-uuid-1');
  const calls = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null };
      }

      if (sql.includes('DELETE FROM order_items')) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release: () => {
      released = true;
    },
  };

  t.mock.method(db, 'connect', async () => client);

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/order-items?id=item-1&order_id=order-1`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    assert.equal(response.status, 404);
  });

  assert.equal(calls[0].sql, 'BEGIN');
  assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
  assert.equal(calls.some((call) => call.sql === 'COMMIT'), false);
  assert.equal(released, true);
});

test('DELETE /api/order-items deletes order when removed item was the last one', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const calls = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [], rowCount: null };
      }

      if (sql.includes('DELETE FROM order_items')) {
        return { rows: [{ id: 'item-1' }], rowCount: 1 };
      }

      if (sql.includes('SELECT 1 FROM order_items')) {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('DELETE FROM orders')) {
        return { rows: [{ id: 'order-1' }], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release: () => {
      released = true;
    },
  };

  t.mock.method(db, 'connect', async () => client);

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/order-items?id=item-1&order_id=order-1`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.affected_rows, 1);
    assert.equal(payload.order_deleted, true);
  });

  assert.ok(calls.some((call) => call.sql.includes('DELETE FROM order_items')));
  assert.ok(calls.some((call) => call.sql.includes('SELECT 1 FROM order_items')));
  assert.ok(calls.some((call) => call.sql.includes('DELETE FROM orders')));
  assert.deepEqual(
    calls.find((call) => call.sql.includes('DELETE FROM order_items')).params,
    ['item-1', 'order-1', userId],
  );
  assert.equal(released, true);
});

test('DELETE /api/order-items recalculates order total when items remain', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const calls = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [], rowCount: null };
      }

      if (sql.includes('DELETE FROM order_items')) {
        return { rows: [{ id: 'item-1' }], rowCount: 1 };
      }

      if (sql.includes('SELECT 1 FROM order_items')) {
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      }

      if (sql.includes('UPDATE orders')) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release: () => {
      released = true;
    },
  };

  t.mock.method(db, 'connect', async () => client);

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/order-items?id=item-1&order_id=order-1`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.order_deleted, false);
  });

  assert.ok(calls.some((call) => call.sql.includes('UPDATE orders')));
  assert.equal(calls.some((call) => call.sql.includes('DELETE FROM orders')), false);
  assert.equal(released, true);
});

test('DELETE /api/order-items returns 404 when non-empty order total update affects no rows', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const calls = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: null };
      }

      if (sql.includes('DELETE FROM order_items')) {
        return { rows: [{ id: 'item-1' }], rowCount: 1 };
      }

      if (sql.includes('SELECT 1 FROM order_items')) {
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      }

      if (sql.includes('UPDATE orders')) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release: () => {
      released = true;
    },
  };

  t.mock.method(db, 'connect', async () => client);

  await withServer(async (port) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/order-items?id=item-1&order_id=order-1`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    assert.equal(response.status, 404);
  });

  assert.ok(calls.some((call) => call.sql === 'ROLLBACK'));
  assert.equal(released, true);
});

test('PUT /api/order-items SQL uses explicit numeric casts to avoid type mismatch', async (t) => {
  const userId = 'user-uuid-1';
  const token = makeToken(userId);
  const calls = [];
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [], rowCount: null };
      }

      if (sql.includes('UPDATE order_items AS oi')) {
        return {
          rows: [{
            id: 'item-1',
            order_id: 'order-1',
            quantity: 2,
            unit_price: '30.00',
            line_total: '60.00',
          }],
          rowCount: 1,
        };
      }

      if (sql.includes('UPDATE orders')) {
        return { rows: [{ total_amount: '60.00' }], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release: () => {},
  };

  t.mock.method(db, 'connect', async () => client);

  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/order-items?id=item-1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quantity: 2 }),
    });

    assert.equal(response.status, 200);
  });

  const updateSql = calls.find((c) => c.sql.includes('UPDATE order_items AS oi')).sql;
  assert.match(updateSql, /SET quantity = \$1::int, line_total = oi\.unit_price \* \$1::numeric/,
    'UPDATE must use explicit ::int and ::numeric casts');
});

test('purchase component expires session and redirects to login on 401 purchase-item mutations', () => {
  const purchaseComponentPath = path.join(__dirname, '..', '..', 'js', 'components', 'app-purchase.js');
  const source = fs.readFileSync(purchaseComponentPath, 'utf8');

  assert.ok(source.includes('if (res.status === 401)'));
  assert.ok(source.includes('this.expireSession();'));
  assert.ok(source.includes('window.location.hash = "#/login";'));
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
