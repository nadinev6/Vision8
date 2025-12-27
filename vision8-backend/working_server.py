#!/usr/bin/env python3
"""
Vision8 Backend Server - Working Version

This version gradually adds functionality while avoiding import issues.
"""

import os
import sys
import time
import uvicorn
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv
import structlog

# Load environment variables
load_dotenv()

# Add src to path for imports
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

# Settings
class Settings:
    API_HOST = os.getenv("API_HOST", "0.0.0.0")
    API_PORT = int(os.getenv("API_PORT", 8000))
    API_DEBUG_MODE = os.getenv("API_DEBUG_MODE", "false").lower() == "true"
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

settings = Settings()

# Setup logging
def setup_logging():
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

setup_logging()
logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("Starting Vision8 Backend Application...")
    yield
    logger.info("Shutting down Vision8 Backend Application...")

# Initialize FastAPI application
app = FastAPI(
    title="Vision8 Backend API",
    description="Intelligent video processing, AI-powered scene generation, and metadata extraction",
    version="1.0.0",
    docs_url="/api/docs" if settings.API_DEBUG_MODE else None,
    redoc_url="/api/redoc" if settings.API_DEBUG_MODE else None,
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

# Add GZip compression middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests."""
    request_id = request.headers.get("X-Request-ID", "no-request-id")
    
    logger.info(
        "Incoming request",
        method=request.method,
        path=request.url.path,
        request_id=request_id,
        client_host=request.client.host if request.client else None
    )
    
    try:
        response = await call_next(request)
        
        logger.info(
            "Request completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            request_id=request_id
        )
        
        return response
        
    except Exception as e:
        logger.error(
            "Request failed",
            method=request.method,
            path=request.url.path,
            error=str(e),
            request_id=request_id,
            exc_info=True
        )
        raise

# Exception handlers
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions."""
    logger.warning(
        "HTTP exception occurred",
        status_code=exc.status_code,
        detail=exc.detail,
        path=request.url.path
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "message": exc.detail,
                "status_code": exc.status_code,
                "path": request.url.path
            }
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle request validation errors."""
    logger.warning(
        "Validation error occurred",
        errors=exc.errors(),
        path=request.url.path
    )
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "message": "Request validation failed",
                "status_code": 422,
                "details": exc.errors(),
                "path": request.url.path
            }
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    logger.error(
        "Unhandled exception occurred",
        error=str(exc),
        path=request.url.path,
        exc_info=True
    )
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "message": "Internal server error" if not settings.API_DEBUG_MODE else str(exc),
                "status_code": 500,
                "path": request.url.path
            }
        }
    )

# Health check endpoint
@app.get("/health", tags=["System"])
async def health_check() -> Dict[str, Any]:
    """Health check endpoint to verify application status."""
    return {
        "status": "healthy",
        "version": "1.0.0",
        "services": {
            "api": "active"
        }
    }

# Readiness probe endpoint
@app.get("/ready", tags=["System"])
async def readiness_check() -> Dict[str, str]:
    """Readiness check endpoint."""
    return {"status": "ready"}

# Liveness probe endpoint
@app.get("/alive", tags=["System"])
async def liveness_check() -> Dict[str, str]:
    """Liveness check endpoint."""
    return {"status": "alive"}

# Import the existing API routes
try:
    # Add src to path for imports
    sys.path.insert(0, str(src_path))
    from api.video_analysis_routes import router as video_analysis_router
    from api.video_generation_routes import router as video_generation_router
    
    # Create API router and include all routes
    from fastapi import APIRouter
    api_router = APIRouter(prefix="/api/v1")
    api_router.include_router(video_analysis_router, prefix="/video")
    api_router.include_router(video_generation_router, prefix="/video")
    
    # Include the API router
    app.include_router(api_router)
    
    logger.info("Video analysis and generation routes loaded successfully")
    
except Exception as e:
    logger.error(f"Failed to load API routes: {str(e)}")
    logger.warning("Running without full API functionality")
    
    # Fallback: create minimal API structure
    from fastapi import APIRouter
    api_router = APIRouter(prefix="/api/v1")
    
    @api_router.get("/video/status")
    async def api_status():
        return {
            "status": "error",
            "message": "API routes failed to load",
            "error": str(e)
        }
    
    app.include_router(api_router)

# Root endpoint
@app.get("/", tags=["System"])
async def root() -> Dict[str, str]:
    """Root endpoint with API information."""
    return {
        "name": "Vision8 Backend API",
        "version": "1.0.0",
        "description": "Intelligent video processing and AI-powered scene generation",
        "documentation": f"http://{settings.API_HOST}:{settings.API_PORT}/api/docs" if settings.API_DEBUG_MODE else "Contact admin for API documentation"
    }

if __name__ == "__main__":
    print("Starting Vision8 Backend Server...")
    print(f"Host: {settings.API_HOST}")
    print(f"Port: {settings.API_PORT}")
    print(f"Debug: {settings.API_DEBUG_MODE}")
    print(f"API Docs: http://{settings.API_HOST}:{settings.API_PORT}/docs")
    
    if settings.API_DEBUG_MODE:
        uvicorn.run(
            "working_server:app",
            host=settings.API_HOST,
            port=settings.API_PORT,
            reload=True,
            log_level="info"
        )
    else:
        uvicorn.run(
            app,
            host=settings.API_HOST,
            port=settings.API_PORT,
            log_level="info"
        )
