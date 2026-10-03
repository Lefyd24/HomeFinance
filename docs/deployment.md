# Deployment

Home Finance ships as a **single Docker image**. One container serves the web app and the API from one port (`8223`), with SQLite on disk. There is no TLS in the container: HTTPS comes from a reverse proxy or [Tailscale](https://tailscale.com) on the host.

```
Browser ──HTTPS──▶ Tailscale Funnel / reverse proxy ──▶ 127.0.0.1:8223 ──▶ container
                                                                           ├─ web app  /
                                                                           └─ API      /api
```

## What the container contains

| Item | Detail |
|---|---|
| Build | Multi-stage: Node 22 builds the React app, `uv` resolves Python deps, a slim Python 3.11 image runs it. A TypeScript error fails the build. |
| Process | `supervisord` runs a single `uvicorn` process with automatic restart. |
| Port | `8223` (configurable with `BACKEND_PORT`). |
| Volumes | `./data` → `/app/data` (database and documents), `./logs` → `/app/logs`, `./secrets` → `/app/secrets` (read-only, for the bank key). |
| Migrations | Applied automatically on every start. See [Migrations](migrations.md). |
| Health | `GET /health` returns `{"status":"healthy","database":"ok"}`, or `503` if the database is unreachable. Compose polls it every 30 s. |
| API docs | Interactive docs at `/docs`, OpenAPI at `/openapi.json`. |

## Production `.env` checklist

```dotenv
DEBUG=false
SECRET_KEY=<openssl rand -hex 32>
NOTIFICATION_ENCRYPTION_KEY=<openssl rand -hex 32>
CORS_ORIGINS=[]
BIND_ADDRESS=127.0.0.1
TRUST_PROXY_HEADERS=true
PUBLIC_BASE_URL=https://finance.your-tailnet.ts.net
ADMIN_EMAILS=["you@example.com"]
```

`BIND_ADDRESS` and `TRUST_PROXY_HEADERS` go together, as explained below.

## Trusting proxy headers

Login, registration and password reset are rate-limited per client IP. Behind a proxy, the app needs to read the real client IP from `X-Forwarded-For`:

- `TRUST_PROXY_HEADERS=false` behind a proxy: every visitor shares the proxy's IP, so they all share one rate-limit bucket.
- `TRUST_PROXY_HEADERS=true` while the port is reachable directly from the network: anyone can forge `X-Forwarded-For` and bypass the limiter.

So the safe combination is **loopback bind + trust on**, with the proxy running on the same host. If you set `BIND_ADDRESS=0.0.0.0` to expose the port on your LAN, set `TRUST_PROXY_HEADERS=false`.

## Option A: Tailscale Funnel (recommended)

Funnel gives you a public HTTPS URL on your `*.ts.net` domain without opening router ports. For tailnet-only access, use `tailscale serve` instead.

```bash
# 1. Start the app (loopback bind is the default)
docker compose up --build -d

# 2. Publish it
tailscale funnel --bg 8223        # public internet
# or: tailscale serve --bg 8223   # tailnet members only

tailscale funnel status           # shows your https://<name>.ts.net URL
```

Then set `PUBLIC_BASE_URL` to that URL in `.env` and run `docker compose restart app`. If you use [bank sync](bank-sync.md), your redirect URL is `<that URL>/api/bank-sync/callback`.

Because Funnel is public, keep registration invite-only (the default), keep rate limits on, and use strong passwords.

### Verify the deployment

Run these against `http://127.0.0.1:8223`, then repeat against your public hostname.

```bash
curl -s  http://127.0.0.1:8223/health                       # {"status":"healthy",...}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8223/            # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8223/api/auth/me # 401 (not logged in)
```

## Option B: another reverse proxy

Any proxy that forwards a single origin works (Caddy, nginx, Traefik). Keep `/api` and `/` on the same host so `CORS_ORIGINS=[]` stays valid. A minimal Caddy example:

```caddyfile
finance.example.com {
    reverse_proxy 127.0.0.1:8223
}
```

Run the proxy on the same host as Docker, keep `BIND_ADDRESS=127.0.0.1` and `TRUST_PROXY_HEADERS=true`.

## Running at boot with systemd

Compose already restarts the container (`restart: unless-stopped`) whenever the Docker daemon starts, so on most systems `systemctl enable docker` is enough. If you prefer a unit that rebuilds from source on start, use this template.

Save as `/etc/systemd/system/personal-finance.service`, replacing the two placeholders:

```ini
[Unit]
Description=Home Finance (Docker)
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/personalfinance
User=YOUR_USER
ExecStart=/usr/bin/docker compose up --build -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose up --build -d
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now personal-finance.service
sudo systemctl status personal-finance.service   # "active (exited)" is normal for Type=oneshot
journalctl -u personal-finance.service -f
```

- `systemctl restart` rebuilds and restarts. `stop` runs `docker compose down`, and your `./data` folder is untouched.
- `YOUR_USER` must be in the `docker` group: `sudo usermod -aG docker YOUR_USER`, then log in again.
- Rebuilding on every boot is slow when offline. Drop `--build` from `ExecStart` if you update manually.
- If you see `docker-credential-desktop` errors on a headless server, set `~/.docker/config.json` to `{"auths": {}}`.

## Exposing on the LAN instead

```dotenv
BIND_ADDRESS=0.0.0.0
TRUST_PROXY_HEADERS=false
```

You then reach the app at `http://<host-ip>:8223` over plain HTTP. Prefer HTTPS, because browsers only allow Web Push and installable PWAs on secure origins.

## Production hardening summary

- `DEBUG=false` and a real `SECRET_KEY`.
- Invite-only registration (always on) and email verification.
- Loopback bind with a local proxy, or LAN bind without trusting proxy headers.
- Back up `data/`, `.env` and `secrets/`. See [Operations](operations.md#backups).
- Errors returned to clients carry only a generic message plus a correlation id. The real traceback stays in the server logs.
- See [Security and privacy](security.md) for the full model.
