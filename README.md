# ZinaLog

ZinaLog is a lightweight, self-hosted logging server with a web dashboard for collecting, searching, and monitoring application logs — without needing a full observability stack.

## 🚀 Quick Start

```bash
npx create-zinalog my-app
cd my-app
npm run dev
```

Open:

```
http://localhost:3000
```

## ✨ Why ZinaLog

* Simple, self-hosted logging
* No heavy infrastructure (no ELK, no Grafana)
* Real-time log streaming
* Built-in alerts (email, Slack, Telegram, Discord)
* API key authentication and rate limiting
* SQLite-based (easy to run anywhere)

## 📦 Features

* HTTP log ingestion (`POST /api/logs`)
* Dashboard for logs, errors, and metrics
* Role-based access (`admin`, `operator`, `viewer`)
* API key management with IP restrictions
* Alerts with cooldown and thresholds
* Optional access auditing

## 📖 Documentation

Full documentation available here:

👉 https://zinalog.com

## ⚠️ Status

ZinaLog is in early development. Expect changes and improvements.

## 🛠 Requirements

* Node.js 20+
* npm
