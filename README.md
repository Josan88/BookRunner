# BookRunner Local Development (Docker)

## Requirements

- Docker Desktop (or Docker Engine + Docker Compose)

## Start the full local stack

1. (Optional) Copy environment variables to override defaults:

   ```bash
   cp .env.example .env
   ```

2. Start frontend + backend + MySQL:

   ```bash
   docker compose up --build
   ```

This is the single command that starts the local stack.

## Local URLs

- Frontend: `http://localhost:8080`
- Backend (direct): `http://localhost:8081`
- MySQL: `localhost:3306` (inside Docker network as `db:3306`)

The frontend uses `/resources/*.php` and is proxied to the backend container, so it works locally without XAMPP.

## Stop and clean up

- Stop services:

  ```bash
  docker compose down
  ```

- Stop and remove DB volume too:

  ```bash
  docker compose down -v
  ```
