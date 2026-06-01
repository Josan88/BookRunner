'use strict';

require('dotenv').config();

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  const appInsights = require('applicationinsights');
  appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING);
  appInsights.start();
  process.on('SIGTERM', () => {
    appInsights.defaultClient.flush();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    appInsights.defaultClient.flush();
    process.exit(0);
  });
}

const express = require('express');
const db = require('./db');
const userRoutes = require('./routes/users');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const orderItemsRoutes = require('./routes/order-items');
const bookRoutes = require('./routes/books');

const app = express();
const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;
const CORS_METHODS = 'GET,POST,PUT,DELETE,OPTIONS';
const CORS_HEADERS = 'Authorization,Content-Type';
const CORS_MAX_AGE_SECONDS = '600';
const BOOKS_SCHEMA_MIGRATION_SQL = `
ALTER TABLE books ADD COLUMN IF NOT EXISTS volume VARCHAR(50);
ALTER TABLE books ADD COLUMN IF NOT EXISTS cover TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS keywords TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT 0;
ALTER TABLE books ADD COLUMN IF NOT EXISTS release_date VARCHAR(20);
ALTER TABLE books ADD COLUMN IF NOT EXISTS book_id VARCHAR(120);

UPDATE books
SET volume = 'Vol ' || COALESCE(
  NULLIF(SUBSTRING(cover FROM '_vol_([0-9]+)'), ''),
  NULLIF(LTRIM(SUBSTRING(book_id FROM '([0-9]+)$'), '0'), ''),
  '1'
)
WHERE volume IS NULL OR BTRIM(volume) = '';

-- Backfill missing cover, page_count, release_date from seed data
UPDATE books AS b SET
  cover = v.cover,
  page_count = v.page_count,
  release_date = v.release_date
FROM (VALUES
  ('One Piece', 'Vol 1', 'images/one_piece_vol_1.jpg', 200, '1997-07-22'),
  ('One Piece', 'Vol 2', 'images/one_piece_vol_2.jpg', 192, '1997-10-22'),
  ('One Piece', 'Vol 3', 'images/one_piece_vol_3.jpg', 192, '1998-01-22'),
  ('Solo Leveling', 'Vol 1', 'images/sl_vol_1.jpg', 192, '2021-03-02'),
  ('Solo Leveling', 'Vol 2', 'images/sl_vol_2.jpg', 192, '2021-07-20'),
  ('Hunter x Hunter', 'Vol 1', 'images/hxh_vol_1.jpg', 192, '1998-06-04'),
  ('Hunter x Hunter', 'Vol 2', 'images/hxh_vol_2.jpg', 192, '1998-09-04'),
  ('Hunter x Hunter', 'Vol 3', 'images/hxh_vol_3.jpg', 192, '1998-12-04'),
  ('Made in Abyss', 'Vol 1', 'images/mia_vol_1.jpg', 192, '2012-10-01'),
  ('Made in Abyss', 'Vol 2', 'images/mia_vol_2.jpg', 192, '2013-02-01'),
  ('Classroom of the Elite', 'Vol 1', 'images/cote_vol_1.jpg', 192, '2019-02-07'),
  ('Classroom of the Elite', 'Vol 2', 'images/cote_vol_2.jpg', 192, '2019-06-11'),
  ('Moriarty the Patriot', 'Vol 1', 'images/moriarty_vol_1.jpg', 208, '2020-10-06'),
  ('Moriarty the Patriot', 'Vol 2', 'images/moriarty_vol_2.jpg', 200, '2021-01-05'),
  ('Moriarty the Patriot', 'Vol 3', 'images/moriarty_vol_3.jpg', 200, '2021-04-06'),
  ('Tokyo Revengers', 'Vol 1', 'images/tr_vol_1.jpg', 192, '2017-03-01'),
  ('Tokyo Revengers', 'Vol 2', 'images/tr_vol_2.jpg', 192, '2017-06-01'),
  ('Jujutsu Kaisen', 'Vol 1', 'images/jjk_vol_1.jpg', 192, '2018-03-05'),
  ('Jujutsu Kaisen', 'Vol 2', 'images/jjk_vol_2.jpg', 192, '2018-06-04'),
  ('Attack on Titan', 'Vol 1', 'images/aot_vol_1.jpg', 192, '2009-09-09'),
  ('Attack on Titan', 'Vol 2', 'images/aot_vol_2.jpg', 192, '2010-01-15'),
  ('Attack on Titan', 'Vol 3', 'images/aot_vol_3.jpg', 192, '2010-04-09'),
  ('Naruto', 'Vol 1', 'images/naruto_vol_1.jpg', 192, '1999-08-03'),
  ('Naruto', 'Vol 2', 'images/naruto_vol_2.jpg', 192, '1999-11-02'),
  ('Dragon Ball', 'Vol 1', 'images/db_vol_1.jpg', 192, '1984-09-20'),
  ('Dragon Ball', 'Vol 2', 'images/db_vol_2.jpg', 192, '1985-01-01'),
  ('Demon Slayer', 'Vol 1', 'images/ds_vol_1.jpg', 192, '2016-02-15'),
  ('Demon Slayer', 'Vol 2', 'images/ds_vol_2.jpg', 192, '2016-05-02'),
  ('The Quintessential Quintuplets', 'Vol 1', 'images/tqq_vol_1.jpg', 192, '2017-08-17'),
  ('The Quintessential Quintuplets', 'Vol 2', 'images/tqq_vol_2.jpg', 192, '2017-11-17'),
  ('The Quintessential Quintuplets', 'Vol 3', 'images/tqq_vol_3.jpg', 192, '2018-02-16'),
  ('Kaguya-sama: Love Is War', 'Vol 1', 'images/kaguya_vol_1.jpg', 192, '2015-05-19'),
  ('Kaguya-sama: Love Is War', 'Vol 2', 'images/kaguya_vol_2.jpg', 192, '2015-08-18'),
  ('Horimiya', 'Vol 1', 'images/horimiya_vol_1.jpg', 192, '2011-10-18'),
  ('Horimiya', 'Vol 2', 'images/horimiya_vol_2.jpg', 192, '2012-01-17'),
  ('Your Lie in April', 'Vol 1', 'images/ylia_vol_1.jpg', 192, '2011-04-06'),
  ('Your Lie in April', 'Vol 2', 'images/ylia_vol_2.jpg', 192, '2011-07-06'),
  ('The Dangers in My Heart', 'Vol 1', 'images/dimh_vol_1.jpg', 192, '2018-04-04'),
  ('Blue Box', 'Vol 1', 'images/bb_vol_1.jpg', 192, '2021-04-05'),
  ('Blue Box', 'Vol 2', 'images/bb_vol_2.jpg', 192, '2021-07-05'),
  ('Blue Box', 'Vol 3', 'images/bb_vol_3.jpg', 192, '2021-10-04'),
  ('Re:Zero - Starting Life in Another World', 'Vol 1', 'images/rezero_vol_1.jpg', 192, '2014-01-20'),
  ('Re:Zero - Starting Life in Another World', 'Vol 2', 'images/rezero_vol_2.jpg', 192, '2014-04-21'),
  ('Re:Zero - Starting Life in Another World', 'Vol 3', 'images/rezero_vol_3.jpg', 192, '2014-07-21')
) AS v(title, volume, cover, page_count, release_date)
WHERE b.title = v.title
  AND b.volume = v.volume
  AND (b.cover IS NULL OR BTRIM(b.cover) = ''
    OR b.page_count IS NULL OR b.page_count = 0
    OR b.release_date IS NULL OR BTRIM(b.release_date) = '');

ALTER TABLE cart_items
  ALTER COLUMN book_id TYPE VARCHAR(120) USING book_id::text;

ALTER TABLE order_items
  ALTER COLUMN book_id TYPE VARCHAR(120) USING book_id::text;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS cover TEXT NOT NULL DEFAULT '';

UPDATE order_items AS oi
SET cover = b.cover
FROM books AS b
WHERE oi.book_id = b.book_id
  AND oi.cover = ''
  AND NULLIF(BTRIM(b.cover), '') IS NOT NULL;
`;

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
const rawTrustProxy = process.env.TRUST_PROXY;

if (rawTrustProxy !== undefined && rawTrustProxy !== '') {
  const numericTrustProxy = Number(rawTrustProxy);
  let trustProxy;
  if (Number.isNaN(numericTrustProxy)) {
    const lower = rawTrustProxy.trim().toLowerCase();
    if (lower === 'true') {
      trustProxy = true;
    } else if (lower === 'false' || lower === '0') {
      trustProxy = false;
    } else {
      trustProxy = rawTrustProxy.trim();
    }
  } else {
    trustProxy = numericTrustProxy;
  }
  app.set('trust proxy', trustProxy);
} else {
  app.set('trust proxy', 1);
}

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
app.use(orderItemsRoutes);
app.use(bookRoutes);

const runStartupMigrations = async () => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(BOOKS_SCHEMA_MIGRATION_SQL);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors and preserve original migration error context
    }
    console.error('Startup books schema migration failed. Application may run with degraded catalog data if books columns are missing:', error);
  } finally {
    client.release();
  }
};

const startServer = async () => {
  await runStartupMigrations();
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
      console.log(`BookRunner API running on http://${HOST}:${PORT}`);
      resolve(server);
    });

    server.once('error', reject);
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start BookRunner API:', error);
    process.exitCode = 1;
  });
}

module.exports = app;
module.exports.runStartupMigrations = runStartupMigrations;
module.exports.startServer = startServer;
