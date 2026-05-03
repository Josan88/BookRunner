# BookRunner Local Development (Docker)

## Requirements

- Docker Desktop (or Docker Engine + Docker Compose)

## Start the full local stack

1. (Optional) Copy environment variables to override defaults:

   ```bash
   cp .env.example .env
   ```

2. Start frontend + Express backend + PostgreSQL:

   ```bash
   docker compose up --build
   ```

This is the single command that starts the local stack.

## Local URLs

All published ports are loopback-only (`127.0.0.1`) for local development.

- Frontend: `http://localhost:8080`
- Backend (Express): `http://localhost:3000`
- Backend health: `http://localhost:3000/health`
- Backend health (via frontend proxy): `http://localhost:8080/health`
- PostgreSQL: `localhost:5432` (inside Docker network as `db:5432`)

The frontend is served by nginx and API requests are proxied to the Express backend.

## Current scope (infrastructure only)

This Docker stack currently validates infrastructure wiring only:

- Frontend container builds and serves static assets
- Express backend boots and responds on `/health`
- PostgreSQL service starts and is reachable on `localhost:5432`

Legacy auth/cart/orders API flows are not migrated in this stack yet and are tracked in:

- #5 (auth)
- #6 (cart)
- #7 (orders)

## Local verification notes

Verified locally with:

```bash
docker compose up --build
```

Then checked:

- Frontend load: `http://localhost:8080`
- Backend health: `http://localhost:3000/health`
- Proxied health: `http://localhost:8080/health`
- PostgreSQL startup: service healthy and reachable on `localhost:5432`

## Stop and clean up

- Stop services:

  ```bash
  docker compose down
  ```

- Stop and remove DB volume too:

  ```bash
  docker compose down -v
  ```

---

## Running the Node.js + Express Backend

### Requirements

- [Node.js](https://nodejs.org/) v18 or later
- npm (bundled with Node.js)

### Step 1: Install dependencies

```bash
cd backend
npm install
```

### Step 2: Configure environment variables

```bash
cp .env.example .env
# Edit .env as needed (PORT, HOST, NODE_ENV, DATABASE_URL)
```

### Step 3: Start the server

```bash
npm start
```

The API will be available at `http://localhost:3000` by default.

### Health check

```
GET /health
```

Returns HTTP 200 with JSON:

```json
{ "status": "ok" }
```

### Run smoke test

```bash
npm test
```

### Verification notes

Verified locally with:

- `npm install`
- `npm start` (server booted successfully)
- `GET /health` returned `200 {"status":"ok"}`
- `npm test` passed for `GET /health`

---
