from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import os

from app.config import settings
from app.database import init_db
from app.logging_config import setup_logging
from sqlalchemy import text
from app.database import engine
import logging
from app.routers import (
    auth,
    accounts,
    categories,
    transactions,
    budgets,
    import_wizard,
    reports,
    goals,
    debts,
    analytics,
    advisor,
    recurring_expenses,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    setup_logging(log_dir=settings.LOG_DIR, log_level=settings.LOG_LEVEL)
    logger = logging.getLogger("app")
    logger.info("Initializing database...")
    init_db()
    logger.info("Database initialized successfully!")
    yield
    # Shutdown
    logger.info("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Personal Finance Management API",
    lifespan=lifespan,
    redirect_slashes=True,
)

# Add CORS middleware - allow frontend on port 3100
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
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
    """Handle all unhandled exceptions."""
    logging.getLogger("app").exception(
        "Unhandled exception",
        extra={"request_url": str(request.url), "request_method": request.method},
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "message": str(exc)},
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
app.include_router(accounts.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(import_wizard.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(debts.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(advisor.router, prefix="/api")
app.include_router(recurring_expenses.router, prefix="/api")


if __name__ == "__main__":
    import uvicorn

    # Use port from environment variable or default to 8223
    port = int(os.getenv("BACKEND_PORT", 8223))
    uvicorn.run(
        "main:app", host="0.0.0.0", port=port, reload=settings.DEBUG, log_level="info"
    )
