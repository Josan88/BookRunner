'use strict';

process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.FRONTEND_ORIGIN = 'http://localhost:8080';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const db = require('./db');
const app = require('./index');

function makeToken(id, email = 'user@example.com') {
  return jwt.sign({ sub: String(id), email }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('Jest + Supertest API smoke flows', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('GET /health returns status ok', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('POST /api/users registers a new user', async () => {
    const queryMock = jest.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql.includes('SELECT id FROM users WHERE email = $1')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO users')) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const response = await request(app)
      .post('/api/users')
      .send({ name: 'Tester', email: 'tester@example.com', password: 'Passw0rd!' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ success: true });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  test('POST /api/users logs in successfully', async () => {
    const password = 'Passw0rd!';
    const passwordHash = await bcrypt.hash(password, 12);

    jest.spyOn(db, 'queryRead').mockResolvedValue({
      rows: [{ id: 'user-1', name: 'Tester', email: 'tester@example.com', password_hash: passwordHash }],
    });

    const response = await request(app)
      .post('/api/users')
      .send({ email: 'tester@example.com', password });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 'user-1',
      name: 'Tester',
      email: 'tester@example.com',
      token: expect.any(String),
    });
  });

  test('GET /api/cart returns authenticated user cart rows', async () => {
    const token = makeToken('user-1');
    jest.spyOn(db, 'queryRead').mockResolvedValue({
      rows: [{ id: 'cart-1', book_title: 'One Piece', quantity: 1, price: '25.00' }],
    });

    const response = await request(app)
      .get('/api/cart')
      .set('Authorization', 'Bearer ' + token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 'cart-1', book_title: 'One Piece', quantity: 1, price: '25.00' }]);
  });

  test('POST /api/orders creates an order from cart items', async () => {
    const token = makeToken('user-1');
    const sequence = jest.spyOn(db, 'query').mockImplementation(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [] };
      }
      if (sql.includes('FROM cart_items')) {
        return {
          rows: [{
            id: '11111111-1111-4111-8111-111111111111',
            book_id: 'one-piece::1',
            title: 'One Piece',
            volume: '1',
            cover: 'cover.jpg',
            unit_price: '25.00',
            quantity: 2,
          }],
        };
      }
      if (sql.includes('INSERT INTO orders')) {
        return { rows: [{ id: '22222222-2222-4222-8222-222222222222' }] };
      }
      if (sql.includes('INSERT INTO order_items')) {
        return { rows: [] };
      }
      if (sql.includes('DELETE FROM cart_items')) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer ' + token)
      .send({ cart_item_ids: ['11111111-1111-4111-8111-111111111111'] });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: { id: '22222222-2222-4222-8222-222222222222' },
    });
    expect(sequence).toHaveBeenCalled();
  });

  test('GET /api/orders returns purchase history wrapper payload', async () => {
    const token = makeToken('user-1');
    const queryMock = jest.spyOn(db, 'queryRead').mockImplementation(async (sql) => {
      if (sql.includes('FROM orders')) {
        return {
          rows: [{
            id: '33333333-3333-4333-8333-333333333333',
            user_id: 'user-1',
            total_amount: '50.00',
            status: 'paid',
            created_at: '2026-01-01T00:00:00.000Z',
          }],
        };
      }
      if (sql.includes('FROM order_items')) {
        return {
          rows: [{
            id: 'item-1',
            order_id: '33333333-3333-4333-8333-333333333333',
            book_id: 'one-piece::1',
            title: 'One Piece',
            unit_price: '25.00',
            quantity: 2,
            line_total: '50.00',
            cover: 'cover.jpg',
          }],
        };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const response = await request(app)
      .get('/api/orders')
      .set('Authorization', 'Bearer ' + token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [{
        id: '33333333-3333-4333-8333-333333333333',
        user_id: 'user-1',
        total_amount: '50.00',
        status: 'paid',
        created_at: '2026-01-01T00:00:00.000Z',
        purchase_date: '2026-01-01T00:00:00.000Z',
        items: [{
          id: 'item-1',
          order_id: '33333333-3333-4333-8333-333333333333',
          book_id: 'one-piece::1',
          title: 'One Piece',
          unit_price: '25.00',
          quantity: 2,
          line_total: '50.00',
          cover: 'cover.jpg',
          book_title: 'One Piece',
          volume: '1',
          price: '25.00',
        }],
      }],
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});
