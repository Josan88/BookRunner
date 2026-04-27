'use strict';

require('dotenv').config();

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(PORT, HOST, () => {
  console.log(`BookRunner API running on http://${HOST}:${PORT}`);
});

module.exports = app;
