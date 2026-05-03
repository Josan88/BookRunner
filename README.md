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

## Current scope (PostgreSQL foundation only)

This Docker stack establishes the PostgreSQL database foundation:

- Frontend container builds and serves static assets
- Express backend boots and responds on `/health`
- PostgreSQL service starts, becomes healthy, and runs `bookrunner.sql` to initialize the schema

**Backend data access (auth, cart, orders) is not yet implemented** and is tracked in:

- #5 (auth)
- #6 (cart)
- #7 (orders)

`DATABASE_URL` is wired into the backend service environment so those issues can connect immediately without further Docker changes.

## Local verification

Run the full stack:

```bash
docker compose up --build
```

Expected results:

- PostgreSQL becomes healthy (`pg_isready` passes)
- Schema tables (`users`, `cart_items`, `orders`, `order_items`) are created from `bookrunner.sql`
- Backend `/health` returns `200 {"status":"ok"}`
- Frontend is accessible at `http://localhost:8080`
- Backend health is accessible at `http://localhost:3000/health` and via proxy at `http://localhost:8080/health`

> **Note:** PostgreSQL starts and initializes the schema, but backend API routes for auth/cart/orders are not yet connected. Those are implemented in #5, #6, and #7.

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
