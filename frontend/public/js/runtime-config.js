/**
 * Fallback backendPort used ONLY by js/api.js when the page is served from a
 * different port than the backend (the split-port local dev workflow: static
 * file server for the frontend + `uv run python main.py` for the backend).
 * Not used in Docker or any same-origin deployment (incl. Tailscale Funnel) —
 * main.py serves the frontend itself there, so this file is never consulted.
 * Regenerate from repo-root .env's BACKEND_PORT: npm run sync:runtime-config (from frontend/)
 */
window.__APP_CONFIG__ = window.__APP_CONFIG__ || { backendPort: 8223 };
