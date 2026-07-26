/**
 * Writes public/js/runtime-config.js from repo-root .env BACKEND_PORT (fallback 8223).
 * Usage from frontend/: npm run sync:runtime-config
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const envPath = path.join(repoRoot, ".env");
let backendPort = 8223;

if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^BACKEND_PORT\s*=\s*(\d+)\s*$/);
    if (m) backendPort = parseInt(m[1], 10);
  }
}

const outPath = path.join(__dirname, "..", "public", "js", "runtime-config.js");
const contents = `/**
 * Fallback backendPort used ONLY by js/api.js when the page is served from a
 * different port than the backend (the split-port local dev workflow). Not
 * used in Docker or any same-origin deployment — main.py serves the frontend
 * itself there. Regenerate: npm run sync:runtime-config (from frontend/)
 */
window.__APP_CONFIG__ = window.__APP_CONFIG__ || { backendPort: ${backendPort} };
`;
fs.writeFileSync(outPath, contents, "utf8");
console.log("Wrote", outPath, "backendPort =", backendPort);
