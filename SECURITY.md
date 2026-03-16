## Security Policy

ZinaLog is designed for **self-hosted deployments within trusted infrastructure** and assumes that the host system is secured and maintained by the administrator, TLS is terminated by a reverse proxy or load balancer, and only trusted administrators have server access. ZinaLog does **not** protect against attackers with root or filesystem access to the host machine.


## Authentication

### Dashboard Access

Dashboard access uses HTTP-only, SameSite=Lax cookies for session management. Optional email-based Multi-Factor Authentication (MFA) is available for additional security. New users and reset accounts receive a temporary password that must be changed on first login. Every login, logout, and user-management action is permanently recorded in an audit trail.

### API Ingestion

API access is authenticated via long-lived Bearer tokens. Keys are stored using a double-hashing scheme: a SHA-256 lookup hash for fast identification and a salted scrypt verification hash to prevent exposure in the event of a database leak. Keys can optionally be restricted to specific IPv4/IPv6 addresses or CIDR ranges.


## Authorization

ZinaLog uses role-based access control (RBAC) with three roles:

- **Admin** — Full system access, including users, API keys, settings, and log deletion.
- **Operator** — Can manage API keys and view logs and stats, but cannot manage users or global settings.
- **Viewer** — Read-only access to logs and metrics.


## Network Protections

### CSRF Protection

All state-changing requests (`POST`, `PUT`, `DELETE`) to the management API are protected by Origin/Referer verification, which ensures requests originate from the ZinaLog domain, as well as Fetch Metadata checks using `Sec-Fetch-Site` headers for modern browser protection.

### Rate Limiting

Per-key request-per-minute limits are enforced in-memory for API key traffic. IP-based rate limiting is applied to administrative routes to mitigate brute-force attacks.


## Recommended Setup

- Always run ZinaLog behind a reverse proxy with TLS enabled.
- Only set `TRUST_PROXY=true` if you are behind a trusted load balancer or proxy.
- Use the built-in retention settings to manage disk usage and data privacy.


## Sensitive Data in Logs

ZinaLog stores logs exactly as received and does not inspect or redact their contents. Administrators should avoid logging credentials or API tokens in their applications, configure log retention policies appropriate to their environment, and restrict dashboard access to trusted users only.


## Known Limitations

- Rate limiting is stored in memory and resets on application restart.
- Multi-instance deployments require an external rate limiting store (e.g., Redis).
- Email-based MFA depends on the security of the configured SMTP provider.


## Reporting Vulnerabilities

Please report security vulnerabilities **responsibly** — do not open public GitHub issues for security problems.

Send a report to **hello@chidiesobe.com** with a description of the issue, steps to reproduce it, and an assessment of potential impact. You will receive an acknowledgement within 72 hours.