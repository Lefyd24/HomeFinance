import logging
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from app.config import settings
from app.database import SessionLocal, engine, init_db
from app.logging_config import setup_logging
from app.models import User
from app.routers import (
    accounts,
    admin,
    advisor,
    ai_chat,
    auth,
    bank_sync,
    budgets,
    categories,
    debts,
    documents,
    goals,
    import_wizard,
    investments,
    notifications,
    recurring_expenses,
    reports,
    transactions,
)
from app.services.scheduler import shutdown_scheduler, start_scheduler
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.routing import Match, Mount
from starlette.types import Scope


def _bootstrap_admins(logger: logging.Logger) -> None:
    """Grant is_admin=True to any EXISTING user whose email is in ADMIN_EMAILS.

    Does not create accounts — only promotes ones that already registered
    (normally via invite code). Safe to run on every startup: it's idempotent.
    """
    if not settings.ADMIN_EMAILS:
        return
    admin_emails = {e.strip().lower() for e in settings.ADMIN_EMAILS if e.strip()}
    if not admin_emails:
        return
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_admin.is_(False)).all()
        promoted = [u for u in users if u.email.lower() in admin_emails]
        for user in promoted:
            user.is_admin = True
        if promoted:
            db.commit()
            logger.info(
                "Promoted %d user(s) to admin from ADMIN_EMAILS: %s",
                len(promoted),
                ", ".join(u.email for u in promoted),
            )
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    setup_logging(log_dir=settings.LOG_DIR, log_level=settings.LOG_LEVEL)
    logger = logging.getLogger("app")
    logger.info("Initializing database...")
    init_db()
    logger.info("Database initialized successfully!")
    _bootstrap_admins(logger)
    start_scheduler(settings, SessionLocal)
    yield
    # Shutdown
    shutdown_scheduler()
    logger.info("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Personal Finance Management API",
    lifespan=lifespan,
    redirect_slashes=True,
)

# CORS — see settings.CORS_ORIGINS and FRONTEND_PORT in app/config.py
# Same-origin deployments (frontend served by this app, e.g. behind Tailscale
# Funnel) need CORS_ORIGINS=[] and no middleware is required at all. A wildcard
# origin must never be combined with allow_credentials=True (browsers reject it,
# and it would defeat cookie/token isolation), so we force credentials off in
# that case rather than silently misconfigure the app.
_cors_origins = settings.CORS_ORIGINS
_cors_allow_credentials = True
if "*" in _cors_origins:
    _cors_allow_credentials = False
    logging.getLogger("app").warning(
        "CORS_ORIGINS includes '*' — forcing allow_credentials=False."
    )
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=_cors_allow_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# Validation error handler (for 422 errors)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors and log them for debugging."""
    logging.getLogger("app").warning(
        "Validation error",
        extra={
            "request_url": str(request.url),
            "request_method": request.method,
            "validation_errors": exc.errors(),
        },
    )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions.

    The client only ever sees a generic message plus a short correlation id —
    never the exception text, which can leak internals (file paths, query
    fragments, library names). The same id is logged alongside the full
    traceback so the owner can match a user's bug report to a log line.
    """
    correlation_id = uuid4().hex[:12]
    logging.getLogger("app").exception(
        "Unhandled exception [%s]",
        correlation_id,
        extra={"request_url": str(request.url), "request_method": request.method},
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "error_id": correlation_id,
        },
    )


# Health check endpoint
@app.get("/health")
def health_check():
    """Health check endpoint."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy", "version": settings.APP_VERSION, "database": "ok"}
    except Exception as exc:
        logging.getLogger("app").warning("Health check failed", exc_info=exc)
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "version": settings.APP_VERSION,
                "database": "error",
            },
        )


# Include routers
app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(import_wizard.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(debts.router, prefix="/api")
app.include_router(advisor.router, prefix="/api")
app.include_router(recurring_expenses.router, prefix="/api")
app.include_router(investments.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(ai_chat.router, prefix="/api")
app.include_router(bank_sync.router, prefix="/api")


class _SpaStaticFiles(StaticFiles):
    """StaticFiles with a single-page-app fallback and sane cache headers.

    StaticFiles(html=True) only serves index.html for *directory* requests, so
    every React Router path ("/dashboard", "/transactions", ...) 404s on a hard
    refresh or a direct link. Fall back to index.html for anything that looks
    like a route rather than a file.

    The extension check matters: a missing hashed bundle
    ("/assets/index-abc123.js" after a redeploy) must stay a 404. Serving
    index.html in its place returns HTML with a JavaScript content type, which
    the browser rejects on a MIME mismatch — a confusing failure to debug.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or Path(path).suffix:
                raise
            response = await super().get_response("index.html", scope)

        # index.html must never be cached: it names the content-hashed bundles,
        # and a stale copy points at files the latest build already deleted —
        # the classic white screen after a redeploy. Everything under assets/ is
        # content-hashed by Vite, so it is safe to cache forever.
        # StaticFiles normalises `path` with os.sep, so it arrives as
        # "assets\index-abc.js" on Windows — compare on parts, not a "assets/"
        # string prefix, or this silently never matches off Linux.
        parts = Path(path).parts
        content_type = response.headers.get("content-type", "")
        # sw.js and manifest.json keep their names across builds, so they are
        # never cache-busted by a hash — they must revalidate or users stay on
        # a service worker pointing at the previous UI's routes.
        if parts and parts[-1] in ("sw.js", "manifest.json"):
            response.headers["Cache-Control"] = "no-cache"
        elif content_type.startswith("text/html"):
            response.headers["Cache-Control"] = "no-cache"
        elif parts and parts[0] == "assets" and response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


class _FrontendMount(Mount):
    """A Mount("/") that never claims /api/* paths.

    Starlette's router treats any Mount as a FULL match for every path under
    its prefix — including "/api/accounts" when only "/api/accounts/" (with
    trailing slash) is actually registered. A plain Mount("/") therefore wins
    that FULL match before the router ever falls back to its normal
    partial-match trailing-slash redirect, which silently breaks every
    /api/* collection endpoint the frontend calls without a trailing slash
    (api.js never adds one). Excluding "/api" here lets that redirect logic
    run as normal for API routes while everything else still falls through to
    the static frontend.
    """

    def matches(self, scope):
        if scope["type"] in ("http", "websocket") and scope.get("path", "").startswith(
            "/api"
        ):
            return Match.NONE, {}
        return super().matches(scope)


# Serve the frontend from the same origin/port as the API (required for Tailscale
# Funnel, which forwards exactly one port to one local service). Mounted LAST so
# every /api/* route, /health, /docs, and /openapi.json — all registered above —
# are matched first; Starlette checks routes in registration order and this Mount
# only catches whatever nothing else claimed. html=True serves index.html for
# directory requests and lets sw.js / manifest.json resolve from the root path.
_frontend_dir = Path(settings.FRONTEND_DIR)
if _frontend_dir.is_dir():
    app.router.routes.append(
        _FrontendMount(
            "/",
            app=_SpaStaticFiles(directory=str(_frontend_dir), html=True),
            name="frontend",
        )
    )
else:
    logging.getLogger("app").warning(
        "FRONTEND_DIR %r does not exist — skipping static frontend mount "
        "(API-only mode).",
        str(_frontend_dir),
    )


if __name__ == "__main__":
    import uvicorn

    # Loopback by default so `tailscale serve`/`funnel` (which connects from
    # 127.0.0.1) is the only way in — see TRUST_PROXY_HEADERS in .env.example.
    # Set BIND_HOST=0.0.0.0 to listen on the LAN/tailnet directly. Inside
    # Docker uvicorn is launched by supervisord and must bind 0.0.0.0; the
    # loopback restriction is applied by the compose port mapping instead.
    # With TRUST_PROXY_HEADERS, honour X-Forwarded-Proto so that anything the
    # app generates as an absolute URL — most visibly FastAPI's trailing-slash
    # redirect — says https, not the http that uvicorn sees from the proxy.
    # Otherwise the browser blocks the redirect as mixed content.
    #
    # forwarded_allow_ips must cover the proxy's apparent source address, which
    # is NOT 127.0.0.1 under Docker (uvicorn sees the bridge gateway). "*" is
    # safe only because the port is published on loopback, so tailscaled is the
    # sole possible client — the same precondition TRUST_PROXY_HEADERS needs.
    uvicorn.run(
        "main:app",
        host=settings.BIND_HOST,
        port=settings.BACKEND_PORT,
        reload=settings.DEBUG,
        log_level="info",
        proxy_headers=settings.TRUST_PROXY_HEADERS,
        forwarded_allow_ips="*" if settings.TRUST_PROXY_HEADERS else "127.0.0.1",
    )
