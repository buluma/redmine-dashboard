# Deployment Guide

This guide provides instructions for setting up the Converge application for local development and for deployment using Docker.

## Local Development Setup

### Prerequisites

- Node.js (version specified in `.nvmrc` if available)
- npm

### 1. Install Dependencies

Clone the repository and install the required npm packages:

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

Open the `.env` file and set the following variables:

**Required:**

- `DATABASE_URL`: The connection string for the database. For local development, the default is `file:./dev.db`.
- `APP_ENCRYPTION_KEY`: A secret key used for encrypting stored Redmine API keys. Generate a secure random string for this.
- `SESSION_SECRET`: A secret key used for signing session cookies. Generate a secure random string for this.
- `SECURE_COOKIES`: Set to `false` for plain-HTTP Docker/Pi/homelab access so browsers keep the login cookie. Omit or set to `true` only when users always access the app over HTTPS.

**Recommended (Sentry error/performance/logs/profiling):**

- `SENTRY_DSN`: Server-side DSN used by Node/Edge Sentry initialization.
- `NEXT_PUBLIC_SENTRY_DSN`: Client-side DSN used by browser Sentry initialization.
- `SENTRY_TRACES_SAMPLE_RATE`: Trace sampling ratio. Recommended defaults: `0.0` in local dev, `0.1` in production.
- `SENTRY_PROFILE_SAMPLE_RATE`: Profiling sampling ratio. Recommended default: `0.0` unless actively profiling.
- `SENTRY_ENABLE_LOGS`: Enables Sentry logs pipeline (`false` by default).
- `SENTRY_ENABLE_CONSOLE_LOGGING`: Sends `console.log/warn/error` to Sentry (`false` by default).
- `SENTRY_SEND_DEFAULT_PII`: Sends default server-side PII to Sentry (`false` by default).
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_PROFILE_SAMPLE_RATE`, `NEXT_PUBLIC_SENTRY_ENABLE_LOGS`, `NEXT_PUBLIC_SENTRY_ENABLE_CONSOLE_LOGGING`, `NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII`: Browser-side Sentry controls; keep aligned with the server settings you intentionally want exposed to client builds.
- `ENABLE_SENTRY_TEST_ROUTES` and `NEXT_PUBLIC_ENABLE_SENTRY_TEST_ROUTES`: Enables local Sentry smoke-test routes/pages (`false` by default).

**Recommended (runtime memory controls):**

- `ENABLE_SYNC_POLLER`: Controls background sync poller startup. Recommended defaults: `false` in local dev, `true` in production.
- `POLL_INTERVAL_MS`: Sync poller interval in milliseconds. Recommended default: `300000`.
- `MEMORY_LOGGING`: Enables periodic `process.memoryUsage()` logging (`false` by default).
- `MEMORY_LOG_INTERVAL_MS`: Interval for memory logs in milliseconds (default: `60000`).

**Optional (Streamline log poller):**

- `ENABLE_STREAMLINE_LOG_POLLER`: Enables auto-fetching of Streamline logs into the database. Defaults to `false`.
- `STREAMLINE_LOG_POLL_INTERVAL_MS`: Log poller interval in milliseconds. Default: `300000` (5 minutes).
- `STREAMLINE_LOG_LOCK_TTL_MS`: Leader lock TTL for the log poller. Default: `90000` (90 seconds).
- `STREAMLINE_ENV`: Streamline environment to fetch logs from (`staging` or `production`). Default: `staging`.
- `STREAMLINE_LOG_FETCH_LIMIT`: Number of records to fetch per log type per poll. Default: `100`.

**Optional (for first-run bootstrap):**

- `REDMINE_BASE_URL`: The base URL of your Redmine instance (e.g., `https://redmine.example.com`).
- `REDMINE_API_KEY`: Your Redmine API key.
- `REDMINE_ALLOWED_BASE_URLS`: Optional comma-separated allowlist for connect/pair flows (e.g., `https://redmine.example.com,https://redbrick.opsio.space`).
- `REDMINE_INSECURE_TLS_HOSTS`: Optional comma-separated hostnames allowed to bypass TLS verification (recommended only for staging with incomplete certificate chains).
- `REDMINE_SYNC_ISSUE_SCOPE`: Sync scope for `/issues.json` pulls. Allowed values: `assigned` (default, `assigned_to_id=me`), `open` (`status_id=open`), `all` (`status_id=*`).

### 3. Initialize the Database

Run the following command to initialize the local SQLite database schema:

```bash
npm run db:init
```

### 4. Start the Application

Start the Next.js development server:

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

## Docker Setup

A Docker setup is provided for a containerized development environment. For more details, see [DOCKER.md](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/DOCKER.md).

### Quick Start

1.  **Configure Environment:** Copy the `.env.example` file to `.env`. The default `DOCKER_DATABASE_URL` is recommended for use with Docker Compose.
    ```bash
    cp .env.example .env
    ```
2.  **Start Services:** Use the Makefile to build and start the containers.
    ```bash
    make up
    ```
3.  **View Logs:**
    ```bash
    make logs
    ```
4.  **Stop Services:**
    ```bash
    make down
    ```
5.  **Reset Database:** To wipe the Docker Postgres volume and start fresh (destructive — this deletes all data in the `postgres-data` volume):
    ```bash
    docker compose down -v
    make up
    ```

### Supabase -> Local Docker Postgres Import

If you want Docker to run on a local Postgres copy of Supabase data:

1. Import Supabase into local Docker Postgres:
   ```bash
   make import-supabase SUPABASE_DATABASE_URL="postgresql://user:pass@host:5432/postgres"
   ```
   The importer excludes Supabase-managed extension objects (`pg_graphql`, `supabase_vault`) during restore.
2. Start Postgres-mode stack:
   ```bash
   make up-pg
   ```
3. Tail logs:
   ```bash
   make logs-pg
   ```
4. Stop Postgres-mode stack:
   ```bash
   make down-pg
   ```

A full list of helper targets is available in the [Makefile](/Users/shadowwalker/Documents/GitHub/redmine-dashboard/Makefile).

## Environment Variables Reference

- `DATABASE_URL`: SQLite file path for local development (default: `file:./dev.db`).
- `DOCKER_DATABASE_URL`: Optional Docker-only SQLite path override. Recommended to use `file:./prisma/dev.db` for Docker Compose setups.
- `DOCKER_POSTGRES_DB`: Local Docker Postgres DB name.
- `DOCKER_POSTGRES_USER`: Local Docker Postgres username.
- `DOCKER_POSTGRES_PASSWORD`: Local Docker Postgres password.
- `DOCKER_POSTGRES_PORT`: Host port mapping for local Docker Postgres (default: `5433`).
- `DOCKER_POSTGRES_DATABASE_URL`: Dashboard connection string used by `docker-compose.yml`'s `dashboard` service.
- `SUPABASE_DATABASE_URL`: Optional convenience variable used by `make import-supabase`.
- `APP_ENCRYPTION_KEY`: Secret key for encrypting Redmine API keys at rest.
- `SESSION_SECRET`: HMAC secret for signing session cookies.
- `SENTRY_DSN`: Optional but recommended for server-side Sentry telemetry.
- `NEXT_PUBLIC_SENTRY_DSN`: Optional but recommended for browser-side Sentry telemetry.
- `SENTRY_TRACES_SAMPLE_RATE`: Trace sampling ratio. Defaults to `0.0` in development and `0.1` in production.
- `SENTRY_PROFILE_SAMPLE_RATE`: Profiling sampling ratio. Defaults to `0.0`.
- `SENTRY_ENABLE_LOGS`: Enables Sentry logs pipeline (`false` by default).
- `SENTRY_ENABLE_CONSOLE_LOGGING`: Sends `console.log/warn/error` to Sentry (`false` by default).
- `SENTRY_SEND_DEFAULT_PII`: Sends default server-side PII to Sentry (`false` by default).
- `NEXT_PUBLIC_SENTRY_*`: Browser-side equivalents for trace/profile/log/PII controls.
- `ENABLE_SENTRY_TEST_ROUTES` / `NEXT_PUBLIC_ENABLE_SENTRY_TEST_ROUTES`: Optional Sentry smoke-test surface; leave disabled outside intentional telemetry checks.
- `ENABLE_SYNC_POLLER`: Enables background sync polling. Defaults to `false` in development and `true` in production.
- `POLL_INTERVAL_MS`: The interval for the sync poller in milliseconds (default: `300000`).
- `LEADER_LOCK_TTL_MS`: The time-to-live for the leader lock in milliseconds (default: `300000`).
- `SYNC_JOB_STALE_MS`: Timeout in milliseconds for resetting stale running or pending sync jobs (default: `600000`).
- `MOBILE_API_ENABLED`: Enables the mobile API surface (`true` by default; set to `false` to disable `/api/mobile/v1/*`).
- `MEMORY_LOGGING`: Enables structured memory usage logging (`false` by default).
- `MEMORY_LOG_INTERVAL_MS`: Memory log interval in milliseconds (default: `60000`).
- `ENABLE_STREAMLINE_LOG_POLLER`: Enables the Streamline log poller for auto-fetching logs (`false` by default).
- `STREAMLINE_LOG_POLL_INTERVAL_MS`: Log poller interval in milliseconds (default: `300000`).
- `STREAMLINE_LOG_LOCK_TTL_MS`: Leader lock TTL for log poller in milliseconds (default: `90000`).
- `STREAMLINE_ENV`: Streamline environment (`staging` or `production`; default: `staging`).
- `STREAMLINE_LOG_FETCH_LIMIT`: Records to fetch per log type per poll (default: `100`).
- `REDMINE_BASE_URL`: Optional. Used for first-run bootstrap to pre-configure the Redmine connection.
- `REDMINE_API_KEY`: Optional. Used for first-run bootstrap.
- `REDMINE_ALLOWED_BASE_URLS`: Optional comma-separated Redmine base URL allowlist for user-provided connect/pair requests.
- `REDMINE_INSECURE_TLS_HOSTS`: Optional comma-separated hostname list for insecure TLS override on specific Redmine hosts.
- `REDMINE_SYNC_ISSUE_SCOPE`: Optional sync scope override for Redmine issue imports (`assigned`, `open`, `all`; default `assigned`).

## Security Notes

- Do not commit `.env` to Git.
- Replace placeholder values (especially `SESSION_SECRET`) before deployment.
- Keep Sentry DSNs in environment variables instead of hardcoding them in source files.

## Available Scripts

- `npm run dev`: Starts the development server.
- `npm run mem:dev`: Starts the development server with periodic memory usage logging enabled.
- `npm run build`: Creates a production build of the application.
- `npm run start`: Starts a production server.
- `npm run mem:start`: Starts the production server with periodic memory usage logging enabled.
- `npm run lint`: Lints the codebase for errors and style issues.
- `npm run test`: Runs the test suite.
- `npm run prisma:generate`: Regenerates the Prisma client.
- `npm run db:init`: Initializes the database schema.

## Production Runtime Profile

For memory-constrained production environments, start the app with:

```bash
NODE_ENV=production NODE_OPTIONS=--max-old-space-size=768 npm run start
```

Use this as a starting point and tune heap size based on GC behavior and request latency.

## Continuous Integration (CI) and Branch Protection

- **CI Workflow:** The CI pipeline is defined in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
- **Job chain:** `lint → typecheck → test → build → a11y → e2e`, run sequentially via `needs:` so a failure early (e.g. lint) skips the rest instead of burning CI minutes on jobs that were never going to matter.
- **Concurrency:** A new push to the same branch cancels any in-flight run for that branch (`concurrency:` block at the top of the workflow).
- **Required Status Checks:** All six jobs (`lint`, `typecheck`, `test`, `build`, `a11y`, `e2e`) should be required for pull requests to be mergeable.

### Recommended Branch Protection for `master`

The default branch is `master`. To protect it, configure the following rules in your GitHub repository settings:

- Require a pull request before merging.
- Require status checks to pass before merging.
  - Enable strict mode: Require branches to be up to date before merging.
- Add `lint`, `typecheck`, `test`, `build`, `a11y`, and `e2e` as required status checks.
- Optionally, include administrators in the branch protection rules.
