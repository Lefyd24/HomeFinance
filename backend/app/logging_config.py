import logging
import os
import shlex
import sys
from pathlib import Path
from logging.handlers import RotatingFileHandler


def _resolve_log_dir(preferred: str) -> str:
    """Use ``preferred`` if we can create files there; else XDG-style dir under the home folder."""
    p = Path(preferred)
    try:
        p.mkdir(parents=True, exist_ok=True)
        probe = p / ".write_probe"
        probe.write_text("", encoding="utf-8")
        probe.unlink()
        return str(p.resolve())
    except OSError:
        pass

    home = Path.home()
    xdg = os.environ.get("XDG_STATE_HOME", str(home / ".local" / "state"))
    fallback = Path(xdg) / "personalfinance" / "logs"
    fallback.mkdir(parents=True, exist_ok=True)
    cmd = f"sudo chown -R \"$USER\" {shlex.quote(str(p.resolve()))}"
    print(
        "WARNING: Log directory is not writable (often root/nobody after Docker): "
        f"{str(p.resolve())!r}. Using {str(fallback.resolve())!r} instead. "
        f"To fix: {cmd}",
        file=sys.stderr,
    )
    return str(fallback.resolve())


def setup_logging(*, log_dir: str, log_level: str) -> None:
    log_dir = _resolve_log_dir(log_dir)

    level = getattr(logging, (log_level or "INFO").upper(), logging.INFO)
    root = logging.getLogger()
    root.setLevel(level)

    # Avoid duplicate handlers if reloaded.
    if root.handlers:
        return

    fmt = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )

    stdout_handler = logging.StreamHandler()
    stdout_handler.setLevel(level)
    stdout_handler.setFormatter(fmt)

    app_handler = RotatingFileHandler(
        filename=os.path.join(log_dir, "app.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
    )
    app_handler.setLevel(level)
    app_handler.setFormatter(fmt)

    err_handler = RotatingFileHandler(
        filename=os.path.join(log_dir, "errors.log"),
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
    )
    err_handler.setLevel(logging.ERROR)
    err_handler.setFormatter(fmt)

    root.addHandler(stdout_handler)
    root.addHandler(app_handler)
    root.addHandler(err_handler)

    # Uvicorn loggers sometimes bypass root handlers.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.propagate = True
