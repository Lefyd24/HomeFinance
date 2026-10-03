# Documentation

Everything you need to install, run, operate and extend **Home Finance**. If you are brand new, start with [Getting started](getting-started.md).

## For people running the app

| Guide | What's inside |
|---|---|
| [Getting started](getting-started.md) | Install with Docker in five minutes, create the first admin, invite your household |
| [User guide](user-guide.md) | Every feature, from accounts and transactions to reports and documents |
| [Configuration reference](configuration.md) | Every environment variable, its default, and the startup checks |
| [Deployment](deployment.md) | Reverse proxies, Tailscale Funnel, systemd, and a production checklist |
| [Operations](operations.md) | Updating, backups and restore, logs, key rotation, troubleshooting |
| [Database migrations](migrations.md) | How Alembic runs, creating a migration, rollbacks, recovering an old database |

## Integrations (all optional)

| Guide | What's inside |
|---|---|
| [Bank connection (Enable Banking)](bank-sync.md) | Step-by-step PSD2 bank sync setup, consent renewal, troubleshooting |
| [AI advisor](ai-advisor.md) | OpenRouter setup, model picker, cost caps, tools, skills, investor profile |
| [Investments](investments.md) | Freedom24 and Binance sync, analytics, comparison, backtesting, research |
| [Notifications](notifications.md) | Email (SMTP) and desktop push (VAPID) alerts |

## Trust and contribution

| Guide | What's inside |
|---|---|
| [Security and privacy](security.md) | The security model and exactly what data leaves your server |
| [Development](development.md) | Architecture, local setup, tests, conventions |

## Quick answers

- **I can't register the first account.** Registration is invite-only, so create the first admin from the command line. See [Getting started](getting-started.md#3-create-the-first-admin).
- **The container restarts in a loop.** A startup check failed. Run `docker compose logs app`, then see [Configuration](configuration.md#startup-validation).
- **How do I back up?** See [Operations](operations.md#backups).
- **Bank sync returns no accounts.** See [Bank connection](bank-sync.md#troubleshooting).
