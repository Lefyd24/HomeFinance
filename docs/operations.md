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

Releases are listed on the [Releases page](https://github.com/Lefyd24/HomeFinance/releases) and in [`CHANGELOG.md`](../CHANGELOG.md). Each says whether it adds migrations or new settings.

```bash
# 1. Back up first (see below), then read the release notes
# 2. Update the code so docker-compose.yml and .env.example are current
git pull            # or: git fetch --tags && git checkout v1.1.0
# 3. Check for new settings
diff <(grep -o '^[A-Z_]*=' .env.example | sort) <(grep -o '^[A-Z_]*=' .env | sort)
# 4. Pull the new image and restart. Migrations apply automatically.
docker compose pull
docker compose up -d
docker compose logs -f app
```

To **pin a version** instead of following `latest`, set it in `.env` and the same commands apply:

```dotenv
PF_IMAGE_TAG=1.0.0
```

Available tags are the exact version (`1.0.0`), the minor line (`1.0`, which receives patch releases) and `latest` (the newest stable release). Pre-releases such as `1.1.0-rc1` are only available by exact tag.

Building from source instead? Use `docker compose up --build -d`. Check `/health` afterwards. Under systemd, `sudo systemctl reload personal-finance.service` does the pull and restart. For how migrations behave and how to roll back, see [Migrations](migrations.md).

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

What the script does:

- **Permissions.** It runs with `umask 077` and keeps `data-backups/` at mode 700, so only the owner can read the backups.
- **Encryption.** Set `BACKUP_AGE_RECIPIENT` to an [age](https://age-encryption.org) public key, and backups are written as `finance_*.db.age` with no plaintext copy kept. The script refuses to run if the variable is set and `age` isn't installed. Keep the matching identity file off the server. To restore, decrypt with `age -d -i key.txt finance_….db.age > finance.db`.
- **Retention.** Backups older than `BACKUP_RETENTION_DAYS` (default `30`) are deleted.

These are environment variables for the script, for example set in the crontab line. They are not app settings.

The script backs up **the database only**. Copy documents and secrets separately:

```bash
rsync -a data/documents/ /mnt/backup/finance/documents/
cp .env /mnt/backup/finance/env.backup
cp -r secrets /mnt/backup/finance/
```

Keep backups off the machine as well, for example an encrypted external drive or object storage. The live database and documents are stored unencrypted, so put `data/` on full-disk encryption (for example LUKS).

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

Per-user SMTP passwords, broker API keys and bank session ids are encrypted with a key derived from `NOTIFICATION_ENCRYPTION_KEY`. When that is unset, the key comes from `SECRET_KEY`. `SECRET_KEY` itself only signs login tokens.

### Rotating `NOTIFICATION_ENCRYPTION_KEY` (or separating it from `SECRET_KEY`)

In production, startup warns when `NOTIFICATION_ENCRYPTION_KEY` is unset or equal to `SECRET_KEY`. To fix that, or to rotate the key:

1. Back up the database.
2. In `.env`, set:
   - `NOTIFICATION_ENCRYPTION_KEY` to a new value (`openssl rand -hex 32`);
   - `NOTIFICATION_ENCRYPTION_KEY_PREVIOUS` to the old key. If you never set one, that is the old `SECRET_KEY`. Several old keys can be listed, comma-separated.
3. Restart. Stored secrets can still be read with the old key, and new ones are written with the new key.
4. Re-encrypt everything under the new key: `cd backend && uv run python scripts/rotate_encryption_key.py --dry-run`, then the same command without `--dry-run`. In Docker, run `docker compose exec app python backend/scripts/rotate_encryption_key.py --dry-run` and then without `--dry-run`. The script works in a single transaction and rolls everything back if any value can't be decrypted. It never prints secret values.
5. Remove `NOTIFICATION_ENCRYPTION_KEY_PREVIOUS` and restart.

### Rotating `SECRET_KEY`

Pin `NOTIFICATION_ENCRYPTION_KEY` first, as above, so stored secrets don't depend on `SECRET_KEY`. Then change `SECRET_KEY` and restart. Every login token becomes invalid, so everyone signs in again. API keys keep working.

If a key was changed without these steps, stored secrets can't be decrypted:

- Bank connections show `error`. Reconnect them.
- Broker sync reports a credential error. Re-enter the keys.
- The Notifications page shows "SMTP password needs re-entering".

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
| `scripts/backup-finance-db.sh` | Safe online SQLite backup, optionally age-encrypted, with retention. See [Backups](#scheduled). |
| `backend/scripts/rotate_encryption_key.py [--dry-run]` | Re-encrypt stored secrets under the current `NOTIFICATION_ENCRYPTION_KEY`. See [Rotating secrets](#rotating-secrets). |
| `backend/scripts/delete_transactions_range.py` | Delete an account's transactions over a date range without changing its balance. Use `--dry-run` first. Handy when replacing a manual account with a bank-synced one. |

Run Python scripts from the repo root with `uv run python scripts/<name>.py`, or inside Docker as shown in [Getting started](getting-started.md#3-create-the-first-admin).
