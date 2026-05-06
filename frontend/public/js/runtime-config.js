/**
 * backendPort from repo-root .env (BACKEND_PORT). Docker overwrites at container start.
 * Local static hosting: npm run sync:runtime-config (from frontend/)
 */
window.__APP_CONFIG__ = window.__APP_CONFIG__ || { backendPort: 8224 };
