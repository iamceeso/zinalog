# ZinaLog 

ZinaLog is a lightweight, self-hosted logging server with a web dashboard for collecting application logs, browsing them in near real time, managing API keys and dashboard users, and configuring alerting without deploying a full observability stack.

## Features

- HTTP log ingestion with API key authentication
- SQLite-backed log storage
- Dashboard pages for overview metrics, log browsing, grouped errors, settings, users, and keys
- Role-based dashboard access with `admin`, `operator`, and `viewer`
- Session-based authentication with optional email MFA
- Alert delivery through email, Telegram, Slack, Discord, or a custom webhook
- Optional access-audit records for dashboard activity

## Requirements

- Node.js 20+
- npm

## Installation

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

For a production build:

```bash
npm run build
npm start
```

## Environment variables

ZinaLog works with zero extra configuration, but these variables are supported:

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_PATH` | `./data/logs.db` | Path to the SQLite database file. The directory is created automatically if it does not exist. |
| `TRUST_PROXY` | unset | When set to `1`, `true`, or `yes`, ZinaLog trusts `x-forwarded-for` and `x-real-ip` for client IP detection. Enable this when running behind a reverse proxy or load balancer. |
| `NODE_ENV` | framework default | Affects production behavior such as secure auth cookies. |

Example:

```bash
DATABASE_PATH=/var/lib/zinalog/logs.db TRUST_PROXY=true npm start
```

## Quick start

The fastest way to get value out of ZinaLog is:

1. Install dependencies with `npm install`.
2. Start the app with `npm run dev`.
3. Open `http://localhost:3000/setup`.
4. Create the initial admin account.
5. Sign in and create an API key.
6. Send a test log to `POST /api/logs`.
7. Open the dashboard and confirm the log appears.

Example end-to-end smoke test:

```bash
curl -X POST http://localhost:3000/api/logs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "level": "error",
    "message": "Billing worker failed to connect",
    "service": "billing-worker",
    "metadata": {
      "jobId": "job_123",
      "requestId": "req_456"
    }
  }'
```

## First-time setup

On a brand-new database, ZinaLog starts in setup mode.

1. Visit `/setup`.
2. Create the first admin user with username, email, and password.
3. ZinaLog signs that user in immediately and redirects to the dashboard.
4. Create one or more API keys for applications that need to write logs.

Important setup behavior:

- Initial setup is only allowed while there are no users in the database.
- After the first admin exists, `/setup` is no longer used for normal operations.
- If a visitor hits `/` before setup is complete, they are redirected to `/setup`.

## Core workflow

ZinaLog is usually used in this order:

1. Create the first admin account.
2. Create API keys for each app or service.
3. Send logs to `POST /api/logs`.
4. Review logs from the dashboard.
5. Configure alerts, retention, and notification channels.
6. Invite additional dashboard users if needed.

## Authentication and roles

Dashboard roles:

- `admin`: full access, including users, keys, alerts, retention, and settings
- `operator`: operational access for logs and key management, without full admin privileges
- `viewer`: read-only access to dashboard data

Authentication behavior:

- Username/password sign-in happens at `/login`
- Successful sign-in creates a `zinalog_session` cookie
- MFA is optional per user and uses an email-delivered verification code
- Invited or reset users can receive a temporary password flow that requires a password change
- Session cookies are `httpOnly` and become `secure` in production mode

## API key management

API keys are managed from the dashboard by admins and operators.

Each key can be configured with:

- `name`
- optional `service`
- optional `allowed_ips`
- `rate_limit`
- optional `expires_at`

Important API key behavior:

- The raw key value is shown only once, when the key is created.
- Keys are stored hashed in SQLite.
- Revoked keys immediately stop working.
- Expired keys are rejected.
- If a key has a `service`, incoming logs are forced to that service value.
- `allowed_ips` accepts exact IPs and CIDR ranges, separated by commas.
- Requests are rate-limited in memory per key, per process, by requests per minute.

Example values for `allowed_ips`:

```text
127.0.0.1
10.0.0.0/24,192.168.1.10
2001:db8::/32
```

## Sending logs

Applications write logs to:

```text
POST /api/logs
```

Headers:

```http
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

Supported levels:

- `info`
- `warning`
- `error`
- `debug`

Request body:

```json
{
  "level": "error",
  "message": "Database connection failed",
  "service": "billing-api",
  "stack": "Error: connect ECONNREFUSED ...",
  "metadata": {
    "requestId": "req_123",
    "tenantId": "tenant_42"
  }
}
```

Field behavior:

- `message` is required.
- `level` defaults to `info` if omitted.
- `service` is optional unless your own conventions require it.
- `metadata` can be any JSON value; ZinaLog stores it as JSON text.
- `stack` is optional and useful for exception traces.

Response:

```json
{
  "status": "logged"
}
```

The write route also sends permissive CORS headers, so browser-based apps can post logs directly if that fits your setup.

## Reading data through the API

Most read routes require an authenticated dashboard session cookie.

### `GET /api/logs`

Returns paginated logs.

Query parameters:

- `level`
- `service`
- `search`
- `from`
- `to`
- `page`
- `limit`

Notes:

- `search` matches against `message`, `service`, and `metadata`.
- `limit` is capped at `200` by the route.
- Results are ordered newest first.

Example:

```bash
curl "http://localhost:3000/api/logs?level=error&service=billing-api&page=1&limit=50" \
  --cookie "zinalog_session=YOUR_SESSION_COOKIE"
```

### `GET /api/export`

Exports filtered logs as JSON or CSV.

```text
GET /api/export?format=json
GET /api/export?format=csv
```

The export route accepts the same filters as `/api/logs`.

### `GET /api/stats`

Returns:

- total log count
- last-24-hours log count
- last-24-hours error count
- per-level totals
- top services
- recent errors
- hourly activity and hourly-by-level data

### `GET /api/services`

Returns the distinct service list, ordered alphabetically. This is mainly used to power filters in the UI.

### `GET /api/errors`

Returns grouped error messages with counts plus first-seen and last-seen timestamps.

### `GET /api/stream`

Streams live updates as Server-Sent Events for near-real-time dashboard refreshes.

## Dashboard usage

### Overview

The dashboard landing page is the high-level health view. It shows:

- total log volume
- logs in the last 24 hours
- errors in the last 24 hours
- top services
- recent errors
- hourly activity charts

Use this page when you want a quick read on whether anything unusual is happening.

### Logs

The logs page is the main investigation surface. It lets you:

- filter by level and service
- search message text and metadata
- filter by date range
- page through results
- export matching logs as JSON or CSV

### Groups and errors

Grouped views cluster repeated messages by `message` and `service`, which makes recurring failures easier to spot than scrolling a raw log feed.

The dedicated errors page focuses only on grouped `error` entries.

### Keys

The keys page is where admins and operators:

- create API keys
- scope keys to a single service
- apply IP restrictions
- set request-per-minute limits
- set expiration timestamps
- revoke keys
- delete keys permanently

### Users

The users page allows admins to:

- create dashboard users
- assign roles
- enable or disable accounts
- update user email addresses
- enable or disable MFA
- issue password resets and temporary-password flows
- delete users

Operators can manage users only within the role limits enforced by the application.

### Settings

The settings surfaces are where admins configure:

- log retention (`retention_days`)
- log cap (`max_logs`)
- alert thresholds
- email delivery settings
- Telegram, Slack, Discord, and webhook notification settings

When `max_logs` is reduced, ZinaLog trims the oldest stored logs immediately to fit the new limit.

### Access audit

ZinaLog can record dashboard page-access events in addition to normal user-management audit logs.

Key behavior:

- page-access auditing can be disabled entirely
- page-access records have their own retention window
- admins can purge access-audit entries manually

## Alerts

ZinaLog evaluates alerts when new logs are written.

Useful settings:

- `alert_levels`: comma-separated levels that should trigger alerts
- `alert_threshold`: minimum number of matching recent logs before notifying
- `alert_cooldown`: cooldown period, in minutes, before the same service/level combination can notify again

Available channels:

- email
- Telegram
- Slack
- Discord
- custom webhook

Implementation notes:

- alert cooldown state is stored in SQLite
- notification fan-out is triggered after log ingestion
- if a log has no service, cooldown tracking uses a shared global bucket internally

## Storage and retention

Logs are stored in SQLite at `DATABASE_PATH`.

Retention controls:

- `retention_days`: how long old logs should be kept when purging
- `max_logs`: hard cap applied during inserts and settings updates

Operational tips:

- back up the SQLite file regularly
- place the database on persistent storage in production
- use storage that works well with SQLite WAL mode
- if you run behind a proxy, set `TRUST_PROXY=true` so IP-based API key restrictions evaluate correctly

## Development commands

```bash
npm run dev
npm run build
npm run lint
npm test
```

## Automated tests

The repository uses the built-in Node test runner plus the existing TypeScript compiler for automated coverage of the async SQLite layer.

Current automated coverage includes:

- database initialization defaults
- async log insertion, filtering, trimming, and stats
- grouped log aggregation, recent-log counting, and retention cleanup
- API key creation, usage tracking, revocation, and deletion
- async user, session, challenge, cooldown, and audit-log operations
- settings parsing fallbacks and auth-record cleanup behavior
- API-key auth validation, IP handling, CIDR allow-lists, and rate limiting
- admin mutation rate limiting behavior
- email template generation for alerts, user invites, and MFA codes

Run the tests with:

```bash
npm test
```

## Operational notes

- ZinaLog uses async SQLite access through `sqlite` and `sqlite3`.
- The database file is created automatically if it does not exist.
- In development, the app caches the DB connection across reloads.
- In production, the app lazily initializes a single async DB connection per process.
