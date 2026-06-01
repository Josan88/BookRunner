'use strict';

const { Pool } = require('pg');

const primaryPool = new Pool({ connectionString: process.env.DATABASE_URL });

const replicaPool = process.env.REPLICA_DATABASE_URL
  ? new Pool({ connectionString: process.env.REPLICA_DATABASE_URL })
  : primaryPool;

module.exports = {
  query: (text, params) => primaryPool.query(text, params),
  queryRead: (text, params) => replicaPool.query(text, params),
  connect: () => primaryPool.connect(),
  primaryPool,
  replicaPool,
};
