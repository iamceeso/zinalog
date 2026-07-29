# ZinaLog

A lightweight, self-hosted logging server with a web dashboard without the complexity of ELK or Grafana.

![ZinaLog Dashboard](./public/dashboard.png)

## Quick Start

Requires Node.js 20+

```bash
npx create-zinalog my-app
cd my-app
npm run dev
```

Open `http://localhost:4000`

## Docker

https://zinalog.com/docs/getting-started

## Features

- HTTP log ingestion (`POST /api/logs`)
- Real-time log streaming
- Dashboard for logs, errors, and metrics
- Role-based access (`admin`, `operator`, `viewer`)
- API key authentication with IP restrictions
- Rate limiting
- Alerts (email, Slack, Telegram, Discord)
- SQLite-based storage no external DB

## Data Persistence

Logs are stored locally in `./data` on your machine, not deleted on `docker compose down -v`.

If you hit permission issues:

```bash
sudo chown -R $USER:$USER data
```

## Documentation

Full docs at [zinalog.com](https://zinalog.com)
