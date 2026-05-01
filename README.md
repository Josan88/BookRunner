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
- MySQL: `localhost:3306` (inside Docker network as `db:3306`)

The frontend is served by nginx and API requests are proxied to the Express backend.

## Stop and clean up

- Stop services:

  ```bash
  docker compose down
  ```

- Stop and remove DB volume too:

  ```bash
  docker compose down -v
  ```
