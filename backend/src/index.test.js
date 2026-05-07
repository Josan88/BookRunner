'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

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
