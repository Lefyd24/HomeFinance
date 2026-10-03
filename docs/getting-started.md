# Getting started

This guide takes you from a fresh clone to a running instance with an admin account and your first invited user. It takes about five minutes.

## Requirements

- Docker and Docker Compose v2
- `openssl` (to generate secrets)
- A machine you control: a home server, a Raspberry Pi, a NAS or a small VPS

For running without Docker, see [Development](development.md).

## 1. Get the code and create your `.env`

```bash
git clone https://github.com/Lefyd24/HomeFinance.git
cd HomeFinance
cp .env.example .env
```

`docker compose` refuses to start if `.env` is missing, because the whole file is forwarded into the container.

## 2. Set the required secrets

Generate two random keys:

```bash
openssl rand -hex 32   # use this for SECRET_KEY
openssl rand -hex 32   # use this for NOTIFICATION_ENCRYPTION_KEY
```

Edit `.env`:

```dotenv
SECRET_KEY=<first key>
NOTIFICATION_ENCRYPTION_KEY=<second key>
DEBUG=false

# Shown on the public Privacy and Terms pages (required by Enable Banking)
LEGAL_OPERATOR_NAME=Your Name
LEGAL_CONTACT_EMAIL=you@example.com
LEGAL_JURISDICTION=Your Country
```

The legal details are not required to run the app, but until they are set the Privacy and Terms pages show a "not configured" notice. See [Configuration](configuration.md#legal-pages).

The app **refuses to start** in production mode (`DEBUG=false`) when:

- `SECRET_KEY` is empty, is the placeholder, or is shorter than 32 characters.
- `NOTIFICATIONS_ENABLED=true` (the default) and `NOTIFICATION_ENCRYPTION_KEY` is empty. Set `NOTIFICATIONS_ENABLED=false` if you don't want notifications.

Back up both keys somewhere safe. If you lose them, sessions are invalidated and any saved per-user SMTP passwords become unreadable. See [key rotation](operations.md#rotating-secrets).

## 3. Create the first admin

Registration needs an invite code, and only admins can create invite codes. A brand-new database has no admin, so the first one comes from a script.

Start the stack once so the database and its schema exist:

```bash
docker compose up -d
```

This pulls the prebuilt image from GitHub Container Registry (amd64 and arm64). To build from your checkout instead, for example to run local changes, use `docker compose up --build -d`.

Then create the admin. The image does not include `scripts/`, so mount it for this one command:

```bash
docker compose run --rm \
  -v "$PWD/scripts:/app/scripts:ro" \
  app python /app/scripts/create_admin.py you@example.com 'a-strong-password' "Your Name"
```

The account is created already verified, so you can log in straight away without any email setup.

## 4. Open the app

Visit **http://localhost:8223** and sign in with the email and password from step 3.

By default the port is bound to `127.0.0.1` only. To reach it from other devices, see [Deployment](deployment.md).

## 5. Promote the admin and invite your household

The script already makes the account an admin, so the Admin page is available right away. If you later want to promote additional accounts, list their emails in `.env`:

```dotenv
ADMIN_EMAILS=["you@example.com","partner@example.com"]
```

Restart the container. Anyone listed who **already has an account** is promoted. This setting never creates accounts.

To invite someone:

1. Open **Admin → Invite Codes → New invite**.
2. Copy the code. It is shown **once**, is single-use, and can have an expiry.
3. Send it to them. They register at `/register` with that code.

Verification emails need SMTP. Without it, invited users cannot verify their address. See [Notifications](notifications.md#email-smtp) and set the global `SMTP_*` variables first. Without SMTP configured, the verification link is written to the server log at WARNING level, so you can still copy it from `docker compose logs app` when you are the one onboarding people.

## 6. Add your data

Add your accounts first, then bring in transactions:

- Enter transactions manually, or
- Upload a CSV or Excel export in **Import**, or
- Connect your bank. See [Bank connection](bank-sync.md).

Then create [categorization rules](user-guide.md#categorization-rules) so new transactions file themselves.

## Everyday commands

| Command | Effect |
|---|---|
| `docker compose up -d` | Start in the background (pulls the image if needed) |
| `docker compose pull && docker compose up -d` | Update to the newest published image |
| `docker compose up --build -d` | Build from this checkout and start |
| `docker compose logs -f app` | Follow logs |
| `docker compose restart app` | Restart (re-reads `.env`) |
| `docker compose down` | Stop (data is kept in `./data`) |
| `docker compose down -v` | Stop and remove named volumes |

Your data lives in `./data` (database and documents), logs in `./logs`, and an optional bank key in `./secrets`. All three are plain folders on the host.

## Where next

- Expose it safely beyond your home network: [Deployment](deployment.md)
- Set up backups before you enter real data: [Operations](operations.md#backups)
- Turn on optional features: [Bank sync](bank-sync.md), [AI advisor](ai-advisor.md), [Notifications](notifications.md)
