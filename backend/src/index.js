'use strict';

require('dotenv').config();

const express = require('express');
const userRoutes = require('./routes/users');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');

const app = express();
const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;
const CORS_METHODS = 'GET,POST,PUT,DELETE,OPTIONS';
const CORS_HEADERS = 'Authorization,Content-Type';
const CORS_MAX_AGE_SECONDS = '600';

const resolvePort = (rawPort) => {
  if (rawPort === undefined) {
    return DEFAULT_PORT;
  }

  const normalizedPort = rawPort.trim();
  if (normalizedPort === '' || !/^\d+$/.test(normalizedPort)) {
    return DEFAULT_PORT;
  }

  const parsedPort = Number(normalizedPort);
  if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > MAX_PORT) {
    return DEFAULT_PORT;
  }

  return parsedPort;
};

const resolveAllowedOrigins = (rawOrigins) => {
  if (!rawOrigins) {
    return new Set();
  }

  const isValidAllowedOrigin = (origin) => {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }
      return parsed.origin === origin;
    } catch {
      return false;
    }
  };

  return new Set(
    rawOrigins
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== '' && origin !== '*' && isValidAllowedOrigin(origin)),
  );
};

const PORT = resolvePort(process.env.PORT);
const HOST = process.env.HOST || '0.0.0.0';
const allowedOrigins = resolveAllowedOrigins(process.env.FRONTEND_ORIGIN);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) {
    return next();
  }

  const isPreflightRequest =
    req.method === 'OPTIONS' && !!req.headers['access-control-request-method'];
  const isAllowedOrigin = allowedOrigins.has(origin);

  if (!isAllowedOrigin) {
    if (isPreflightRequest) {
      return res.sendStatus(403);
    }
    return next();
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');

  if (isPreflightRequest) {
    res.setHeader('Access-Control-Allow-Methods', CORS_METHODS);
    res.setHeader('Access-Control-Allow-Headers', CORS_HEADERS);
    res.setHeader('Access-Control-Max-Age', CORS_MAX_AGE_SECONDS);
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(userRoutes);
app.use(cartRoutes);
app.use(orderRoutes);

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`BookRunner API running on http://${HOST}:${PORT}`);
  });
}

module.exports = app;
