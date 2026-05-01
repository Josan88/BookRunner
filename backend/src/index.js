'use strict';

require('dotenv').config();

const express = require('express');

const app = express();
const resolvePort = (rawPort) => {
  if (rawPort === undefined || rawPort.trim() === '') {
    return 3000;
  }

  const parsedPort = Number.parseInt(rawPort, 10);
  return Number.isNaN(parsedPort) ? 3000 : parsedPort;
};

const PORT = resolvePort(process.env.PORT);
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
