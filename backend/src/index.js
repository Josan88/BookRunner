'use strict';

require('dotenv').config();

const express = require('express');

const app = express();
const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
const PORT = Number.isNaN(parsedPort) ? 3000 : parsedPort;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`BookRunner API running on http://${HOST}:${PORT}`);
  });
}

module.exports = app;
