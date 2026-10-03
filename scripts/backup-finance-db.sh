#!/usr/bin/env bash
# Monthly SQLite backup for Home Finance (see crontab: 1st of month 03:00).
#
# Test like cron's minimal environment (script augments PATH for Linuxbrew etc.):
#   env -i HOME="$HOME" PATH="/usr/bin:/bin" USER="$(id -un)" LOGNAME="$(id -un)" \
#     SHELL=/bin/bash /path/to/scripts/backup-finance-db.sh
set -euo pipefail

# Cron jobs often run with PATH=/usr/bin:/bin — extend so sqlite3 is found (e.g. Linuxbrew).
: "${HOME:=$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6)}"
export PATH="${PATH:-/usr/bin:/bin}:/usr/local/bin:${HOME}/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/bin:${HOME}/.local/bin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_PATH="${PROJECT_ROOT}/data/finance.db"
BACKUP_DIR="${PROJECT_ROOT}/data-backups"
CRON_LOG="${BACKUP_DIR}/cron.log"

mkdir -p "${BACKUP_DIR}"

log() {
	local line
	line="$(date -Iseconds) $*"
	printf '%s\n' "${line}" >>"${CRON_LOG}"
	if [[ -t 2 ]]; then
		printf '%s\n' "${line}" >&2
	fi
}

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="${BACKUP_DIR}/finance_${STAMP}.db"

if ! command -v sqlite3 >/dev/null 2>&1; then
	log "error: sqlite3 not found"
	exit 1
fi

if [[ ! -f "${DB_PATH}" ]]; then
	log "error: database not found at ${DB_PATH}"
	exit 1
fi

if sqlite3 "${DB_PATH}" ".backup '${OUT}'"; then
	log "backup ok: ${OUT}"
	exit 0
fi

log "error: backup failed"
exit 1
