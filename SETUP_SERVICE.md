# How to Install the Systemd Service for Personal Finance

This guide walks you through installing the `personal-finance.service` so Docker Compose starts your app automatically on boot and you can control it with simple `systemctl` commands.

---

## Prerequisites

- Docker and Docker Compose installed and working.
- The project is cloned at `/home/lefteris-fthenos/Desktop/Development/PersonalFinance`.
- Your `.env` file is populated in the project root.

---

## Step 1 — Copy the service file into place

```bash
sudo cp service.txt /etc/systemd/system/personal-finance.service
```

This places the unit file where systemd looks for it.

---

## Step 2 — Reload systemd and enable the service

```bash
sudo systemctl daemon-reload
```

Tell systemd to scan for new/changed unit files.

```bash
sudo systemctl enable personal-finance.service
```

Enable the service so it starts automatically on every boot.

---

## Step 3 — Start the service

```bash
sudo systemctl start personal-finance.service
```

Docker Compose will now build (if needed) and start the containers.

---

## Step 4 — Check the status

```bash
sudo systemctl status personal-finance.service
```

You should see **"active (exited)"** with a note that the service exited successfully. This is normal — the service is of type `oneshot`; it starts the containers and exits, but the containers keep running.

---

## Daily Usage Commands

| Action | Command |
|--------|---------|
| **Start** the app | `sudo systemctl start personal-finance.service` |
| **Stop** the app | `sudo systemctl stop personal-finance.service` |
| **Restart / rebuild** the app | `sudo systemctl restart personal-finance.service` |
| **Check status** | `sudo systemctl status personal-finance.service` |
| **View logs** | `journalctl -u personal-finance.service -f` |
| **Disable auto-start on boot** | `sudo systemctl disable personal-finance.service` |

- `start` runs `docker compose up --build -d` (builds and starts containers in detached mode).
- `stop` runs `docker compose down` (stops and removes containers, preserving the data volume).
- `restart` does a full rebuild and restart (useful after code changes).
- `journalctl -u personal-finance.service -f` streams live logs from the service.

---

## Troubleshooting

### "docker-credential-desktop" error again

If the build fails with:

```
failed to solve: error getting credentials - err: exec: "docker-credential-desktop"
```

Run this once to clear the Docker credential config:

```bash
nano ~/.docker/config.json
```

Change the file to contain only:

```json
{
	"auths": {}
}
```

### "Permission denied" errors

If you see permission errors, make sure **your user** (`lefteris-fthenos`) can run Docker commands:

```bash
sudo usermod -aG docker lefteris-fthenos
```

Then log out and back in, or run `newgrp docker` to refresh the group in your current shell.

### Container fails to start

Check the container logs directly:

```bash
docker compose logs
```

or for the specific container:

```bash
docker logs personalfinance-app
```
