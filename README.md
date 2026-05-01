# BookRunner Local Development (Docker)

## Requirements

- Docker Desktop (or Docker Engine + Docker Compose)

## Start the full local stack

1. (Optional) Copy environment variables to override defaults:

   ```bash
   cp .env.example .env
   ```

2. Start frontend + Express backend + MySQL:

   ```bash
   docker compose up --build
   ```

This is the single command that starts the local stack.

## Local URLs

- Frontend: `http://localhost:8080`
- Backend (Express): `http://localhost:3000`
- Backend health: `http://localhost:3000/health`
- Backend health (via frontend proxy): `http://localhost:8080/health`
- MySQL: `localhost:3306` (inside Docker network as `db:3306`)

The frontend is served by nginx and API requests are proxied to the Express backend.

## Current scope (infrastructure only)

This Docker stack currently validates infrastructure wiring only:

- Frontend container builds and serves static assets
- Express backend boots and responds on `/health`
- MySQL service starts and is reachable on `localhost:3306`

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
- MySQL startup: service healthy and reachable on `localhost:3306`

## Stop and clean up

- Stop services:

  ```bash
  docker compose down
  ```

- Stop and remove DB volume too:

  ```bash
  docker compose down -v
  ```
