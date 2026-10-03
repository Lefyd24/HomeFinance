# Operations

Day-two tasks: updating, backing up, restoring, reading logs and fixing common problems.

## What lives where

| Path (host) | Contents | Back up? |
|---|---|---|
| `data/finance.db` | The SQLite database | **Yes** |
| `data/documents/<user_id>/` | Uploaded files | **Yes** |
| `.env` | Settings and secret keys | **Yes**, and store it securely |
| `secrets/*.pem` | Enable Banking private key | **Yes**, it can't be re-downloaded |
| `logs/` | `app.log`, `errors.log` (rotating, 10 MB × 5), `backend.*.log`, `supervisord.log` | Optional |

## Updating

```bash
# 1. Back up first (see below)
git pull
# 2. Check for new settings
diff <(grep -o '^[A-Z_]*=' .env.example | sort) <(grep -o '^[A-Z_]*=' .env | sort)
# 3. Rebuild and restart. Migrations apply automatically.
docker compose up --build -d
docker compose logs -f app
```

Check `/health` afterwards. Under systemd, `sudo systemctl restart personal-finance.service` does the same. For how migrations behave and how to roll back, see [Migrations](migrations.md).

## Backups

SQLite may be running in WAL mode, so **don't copy `finance.db` while the app runs**. Use SQLite's online backup instead. It needs the `sqlite3` CLI on the host.

### One-off

```bash
mkdir -p data-backups
sqlite3 data/finance.db ".backup 'data-backups/finance_$(date +%Y%m%d_%H%M%S).db'"
```

### Scheduled

`scripts/backup-finance-db.sh` does the same, logging to `data-backups/cron.log`. Example crontab entry, which runs at 03:00 every day:

```cron
0 3 * * * /opt/personalfinance/scripts/backup-finance-db.sh
```

It backs up **the database only**. Copy documents and secrets separately:

```bash
rsync -a data/documents/ /mnt/backup/finance/documents/
cp .env /mnt/backup/finance/env.backup
cp -r secrets /mnt/backup/finance/
```

Keep backups off the machine as well, for example an encrypted external drive or object storage.

## Restoring

```bash
docker compose down
cp data-backups/finance_YYYYMMDD_HHMMSS.db data/finance.db
rm -f data/finance.db-wal data/finance.db-shm      # stale journals from the old DB
rsync -a /mnt/backup/finance/documents/ data/documents/
docker compose up -d
```

Pending migrations are applied on startup. Restoring `.env` with the **original** `SECRET_KEY` and `NOTIFICATION_ENCRYPTION_KEY` matters, because saved SMTP passwords, broker API keys and bank sessions are encrypted with keys derived from them.

## Logs

```bash
docker compose logs -f app          # container output
tail -f logs/app.log                # application log
tail -f logs/errors.log             # errors only
```

Set `LOG_LEVEL=DEBUG` temporarily for more detail. Clients only ever see a generic error and a correlation id, so search the logs for that id to find the real traceback.

## Rotating secrets

Several features encrypt data with a key derived from your settings:

- **Per-user SMTP passwords** use `NOTIFICATION_ENCRYPTION_KEY` (or `SECRET_KEY` if it is unset).
- **Bank session ids** and **broker API keys** are encrypted by the app's crypto helper, keyed from the same settings.

Rules of thumb:

1. **Pin `NOTIFICATION_ENCRYPTION_KEY` early**, before anyone saves a personal SMTP password.
2. **Never change `NOTIFICATION_ENCRYPTION_KEY`** without asking users to re-enter their SMTP passwords. Otherwise they become unreadable and the UI shows "SMTP password needs re-entering".
3. If you must rotate `SECRET_KEY` on an existing install, first set `NOTIFICATION_ENCRYPTION_KEY` to the *old* `SECRET_KEY` value, then rotate. Rotating `SECRET_KEY` logs everyone out.
4. After a rotation, bank connections may fail with a decryption error and show as `error`. Reconnect them, and re-enter broker keys if sync reports a credential error.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Container restarts in a loop | A startup check failed. `docker compose logs app` names the missing variable. See [Configuration](configuration.md#startup-validation). |
| `docker compose up` says `.env` not found | `cp .env.example .env` |
| Can't register the first user | Registration needs an invite. Create the first admin with `create_admin.py`. See [Getting started](getting-started.md#3-create-the-first-admin). |
| Users can't log in: "verify your email" | SMTP isn't configured, or the mail went to spam. Check `SMTP_*`, and look for the link in `logs/app.log`. |
| `429 Too Many Requests` on login for everyone | Behind a proxy with `TRUST_PROXY_HEADERS=false`: all visitors share one bucket. See [Deployment](deployment.md#trusting-proxy-headers). |
| App unreachable from another device | The port is bound to loopback. Use Tailscale or a proxy, or set `BIND_ADDRESS` as described in [Deployment](deployment.md#exposing-on-the-lan-instead). |
| `AI_MONTHLY_CAP_USD` parse error at startup | The variable is set but empty. Remove the line. |
| Bank sync returns nothing | See the [bank sync troubleshooting table](bank-sync.md#troubleshooting). |
| AI chat says "not configured" | Set `OPENROUTER_API_KEY`. See [AI advisor](ai-advisor.md). |
| Push notifications don't arrive | Needs HTTPS, VAPID keys and a click on "Enable desktop notifications". See [Notifications](notifications.md). |
| Missing columns or "no such table" after an update | See [Migrations](migrations.md#recovering-a-database). |
| `docker compose down -v` wiped data | `-v` removes **named** volumes only. The default setup stores data in `./data`, which is a bind mount and is kept. Restore from a backup if the folder itself was deleted. |

## One-off maintenance scripts

| Script | Purpose |
|---|---|
| `scripts/create_admin.py <email> <password> [name]` | Create a verified admin directly in the database |
| `scripts/generate_vapid_keys.py` | Generate Web Push keys and append them to `.env` |
| `scripts/backup-finance-db.sh` | Safe online SQLite backup |
| `backend/scripts/delete_transactions_range.py` | Delete an account's transactions over a date range without changing its balance. Use `--dry-run` first. Handy when replacing a manual account with a bank-synced one. |

Run Python scripts from the repo root with `uv run python scripts/<name>.py`, or inside Docker as shown in [Getting started](getting-started.md#3-create-the-first-admin).
