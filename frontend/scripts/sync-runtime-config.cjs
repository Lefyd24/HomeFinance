/**
 * Writes public/js/runtime-config.js from repo-root .env BACKEND_PORT / FRONTEND_PORT
 * (fallbacks 8223 / 3100). Usage from frontend/: npm run sync:runtime-config
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const envPath = path.join(repoRoot, ".env");
let backendPort = 8223;
let frontendPort = 3100;

if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const backend = trimmed.match(/^BACKEND_PORT\s*=\s*(\d+)/);
    if (backend) backendPort = parseInt(backend[1], 10);
    const frontend = trimmed.match(/^FRONTEND_PORT\s*=\s*(\d+)/);
    if (frontend) frontendPort = parseInt(frontend[1], 10);
  }
}

const outPath = path.join(__dirname, "..", "public", "js", "runtime-config.js");
const contents = `/**
 * Ports used ONLY by js/api.js to detect the split-port local dev workflow
 * (static file server on FRONTEND_PORT + \`uv run python main.py\` on
 * BACKEND_PORT). api.js only falls back to an absolute backend URL when the
 * page is actually served from frontendPort; every same-origin deployment —
 * Docker, Tailscale Serve/Funnel, or main.py directly — uses '/api'.
 * Regenerate: npm run sync:runtime-config (from frontend/)
 */
window.__APP_CONFIG__ = window.__APP_CONFIG__ || { backendPort: ${backendPort}, frontendPort: ${frontendPort} };
`;
fs.writeFileSync(outPath, contents, "utf8");
console.log("Wrote", outPath, "backendPort =", backendPort, "frontendPort =", frontendPort);
