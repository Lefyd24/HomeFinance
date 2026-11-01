#!/usr/bin/env bash
# Monthly SQLite backup for Home Finance (see crontab: 1st of month 03:00).
#
# Test like cron's minimal environment (script augments PATH for Linuxbrew etc.):
#   env -i HOME="$HOME" PATH="/usr/bin:/bin" USER="$(id -un)" LOGNAME="$(id -un)" \
#     SHELL=/bin/bash /path/to/scripts/backup-finance-db.sh
set -euo pipefail
umask 077

# Cron jobs often run with PATH=/usr/bin:/bin — extend so sqlite3 is found (e.g. Linuxbrew).
: "${HOME:=$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f6)}"
export PATH="${PATH:-/usr/bin:/bin}:/usr/local/bin:${HOME}/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/bin:${HOME}/.local/bin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DB_PATH="${PROJECT_ROOT}/data/finance.db"
BACKUP_DIR="${PROJECT_ROOT}/data-backups"
CRON_LOG="${BACKUP_DIR}/cron.log"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

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

if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] && ! command -v age >/dev/null 2>&1; then
	log "error: BACKUP_AGE_RECIPIENT is set but age not found; refusing to write a plaintext backup"
	exit 1
fi

if ! sqlite3 "${DB_PATH}" ".backup '${OUT}'"; then
	rm -f "${OUT}"
	log "error: backup failed"
	exit 1
fi

if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]]; then
	if age -r "${BACKUP_AGE_RECIPIENT}" -o "${OUT}.age" "${OUT}"; then
		rm -f "${OUT}"
		OUT="${OUT}.age"
	else
		rm -f "${OUT}" "${OUT}.age"
		log "error: age encryption failed"
		exit 1
	fi
fi

log "backup ok: ${OUT}"

# Retention: prune old backups (only files matching our naming).
find "${BACKUP_DIR}" -maxdepth 1 -type f \( -name 'finance_*.db' -o -name 'finance_*.db.age' \) \
	-mtime "+${RETENTION_DAYS}" -delete
exit 0
