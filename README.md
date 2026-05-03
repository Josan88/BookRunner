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
- PostgreSQL service starts, becomes healthy, and runs `bookrunner.sql` when the data volume is first initialized
- Backend receives `DATABASE_URL` for future PostgreSQL-backed API work

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

> **Schema reset:** PostgreSQL init scripts only run when the data volume is empty. If `bookrunner.sql` changes, run `docker compose down -v` before starting the stack again to force a fresh schema initialization.

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

## GitHub Actions CI/CD

Two workflow files drive the automation pipeline:

### CI (`ci.yml`)

Triggered on every push and pull request to any branch. The `test` job runs first; `build-backend` and `build-frontend` both depend on `test` and then run in parallel:

1. **Backend tests** – installs Node.js 20, runs `npm ci` and `npm test` inside `backend/`
2. **Build backend Docker image** – builds `docker/backend/Dockerfile` (no push)
3. **Build frontend Docker image** – builds `docker/frontend/Dockerfile` (no push)

> **Frontend/Selenium checks:** No Selenium test infrastructure exists in this repository yet. Frontend integration tests are deferred to issue #10 and will be added to CI once that work is complete.

### CD (`cd.yml`)

Triggered on push to `main` and on version tags (`v*`). Concurrent runs on the same ref are cancelled automatically (`cancel-in-progress: true`).

1. **Backend tests** – same as CI
2. **Build & push images to ACR** – logs in to Azure Container Registry and pushes both images. Branch builds are tagged `main-<8-char SHA>`; tag builds use the tag name (e.g. `v1.2.3`).
3. **Deploy to staging** – deploys to Azure Container Apps when the commit lands on `main`
4. **Deploy to production** – deploys to Azure Container Apps when a `v*` tag is pushed **and** the tagged commit is reachable from `main` (prevents shipping code that bypassed staging)

### Required GitHub Secrets

Configure these in **Settings → Secrets and variables → Actions** before the CD workflow can run:

| Secret | Description |
|--------|-------------|
| `ACR_LOGIN_SERVER` | ACR login server, e.g. `myregistry.azurecr.io` |
| `ACR_USERNAME` | ACR admin username (or service-principal client ID) |
| `ACR_PASSWORD` | ACR admin password (or service-principal client secret) |
| `AZURE_CREDENTIALS` | JSON service-principal credentials. Create with:<br>`az ad sp create-for-rbac --name bookrunner-cicd --role contributor --scopes /subscriptions/<SUB_ID>/resourceGroups/<RG> --json-auth` |
| `ACA_RESOURCE_GROUP` | Azure resource group containing the Container Apps |
| `ACA_STAGING_BACKEND_APP` | Container App name for staging backend |
| `ACA_STAGING_FRONTEND_APP` | Container App name for staging frontend |
| `ACA_PRODUCTION_BACKEND_APP` | Container App name for production backend |
| `ACA_PRODUCTION_FRONTEND_APP` | Container App name for production frontend |

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

`DATABASE_URL` is available for PostgreSQL-backed endpoints, but the current backend only uses `/health`. Auth, cart, and order data access are tracked separately in #5, #6, and #7.

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
