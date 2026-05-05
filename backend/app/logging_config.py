import logging
import os
from logging.handlers import RotatingFileHandler


def setup_logging(*, log_dir: str, log_level: str) -> None:
    os.makedirs(log_dir, exist_ok=True)

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
