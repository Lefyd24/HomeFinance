/**
 * Ports used ONLY by js/api.js to detect the split-port local dev workflow
 * (static file server for the frontend on FRONTEND_PORT + `uv run python
 * main.py` for the backend on BACKEND_PORT).
 *
 * api.js falls back to `http://<host>:<backendPort>/api` only when the page is
 * actually being served from `frontendPort`. Every same-origin deployment —
 * Docker, Tailscale Serve/Funnel, or running main.py directly — resolves to the
 * relative '/api' instead, so these values are irrelevant there.
 *
 * Regenerate from repo-root .env: npm run sync:runtime-config (from frontend/)
 */
window.__APP_CONFIG__ = window.__APP_CONFIG__ || { backendPort: 8223, frontendPort: 3100 };
