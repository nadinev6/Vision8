"""
Vision8 Backend - Main Application Entry Point

This module initializes and configures the FastAPI application with all necessary
middleware, services, and API routes for intelligent video processing and search.
"""

import os
import sys
from contextlib import asynccontextmanager
from typing import Dict, Any

import uvicorn
import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Simple settings for now - will be replaced with proper config module later
class SimpleSettings:
    API_HOST = os.getenv("API_HOST", "0.0.0.0")
    API_PORT = int(os.getenv("API_PORT", 8000))
    API_DEBUG_MODE = os.getenv("API_DEBUG_MODE", "false").lower() == "true"
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    # Placeholder configs for services
    ELASTIC_URL = os.getenv("ELASTIC_URL", "http://localhost:9200")
    ELASTIC_API_KEY = os.getenv("ELASTIC_API_KEY")
    ELASTIC_INDEX = os.getenv("ELASTIC_INDEX", "scene_segments")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash-preview-05-20")
    VECTOR_CACHE_SIZE = int(os.getenv("VECTOR_CACHE_SIZE", 1000))
    VECTOR_CACHE_TTL = int(os.getenv("VECTOR_CACHE_TTL", 3600))

settings = SimpleSettings()

# Simple logging setup - will be replaced with proper logging module later
def setup_simple_logging(level: str):
    import logging
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
    logging.getLogger().setLevel(level)

setup_simple_logging(settings.LOG_LEVEL)
logger = structlog.get_logger()


class ServiceRegistry:
    """Registry for managing application services."""

    def __init__(self):
        self.elasticsearch = None
        self.metadata_generator = None
        self.conversation_handler = None
        self.cache_service = None

    async def initialize(self):
        """Initialize all application services."""
        try:
            logger.info("Initializing application services...")

            # For now, skip service initialization to get the app running
            # These will be uncommented when the service modules are implemented
            logger.info("Service initialization skipped for basic startup test")

            logger.info("Mock services initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize services: {str(e)}", exc_info=True)
            raise

    async def shutdown(self):
        """Cleanup and shutdown all services."""
        try:
            logger.info("Shutting down application services...")
            logger.info("All services shut down successfully")

        except Exception as e:
            logger.error(f"Error during service shutdown: {str(e)}", exc_info=True)


# Global service registry
service_registry = ServiceRegistry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager for startup and shutdown events.
    """
    # Startup
    logger.info("Starting Vision8 Backend Application...")
    logger.info(f"Environment: {'Production' if not settings.API_DEBUG_MODE else 'Development'}")
    logger.info(f"API Host: {settings.API_HOST}:{settings.API_PORT}")
    
    try:
        await service_registry.initialize()
        logger.info("Application startup complete")
        yield
    finally:
        # Shutdown
        logger.info("Initiating application shutdown...")
        await service_registry.shutdown()
        logger.info("Application shutdown complete")


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


# Setup security middleware (rate limiting, etc.)
# TODO: Implement setup_security_middleware when core modules are ready
# setup_security_middleware(app, settings)


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
    """
    Health check endpoint to verify application status.
    """
    try:
        # Check Elasticsearch connection
        es_healthy = False  # Temporarily disable to avoid issues during basic testing
        
        return {
            "status": "healthy" if es_healthy else "degraded",
            "version": "1.0.0",
            "services": {
                "elasticsearch": "connected" if es_healthy else "disconnected",
                "metadata_generator": "active" if service_registry.metadata_generator else "inactive",
                "conversation_handler": "active" if service_registry.conversation_handler else "inactive",
                "cache_service": "active" if service_registry.cache_service else "inactive"
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }


# Readiness probe endpoint
@app.get("/ready", tags=["System"])
async def readiness_check() -> Dict[str, str]:
    """
    Readiness check endpoint for Kubernetes/Cloud Run deployment.
    """
    return {"status": "ready"}


# Liveness probe endpoint
@app.get("/alive", tags=["System"])
async def liveness_check() -> Dict[str, str]:
    """
    Liveness check endpoint for Kubernetes/Cloud Run deployment.
    """
    return {"status": "alive"}


# Include API routes
from api.routes import router as api_router
app.include_router(api_router, prefix="/api/v1")


# Root endpoint
@app.get("/", tags=["System"])
async def root() -> Dict[str, str]:
    """
    Root endpoint with API information.
    """
    return {
        "name": "Vision8 Backend API",
        "version": "1.0.0",
        "description": "Intelligent video processing and AI-powered scene generation",
        "documentation": f"http://{settings.API_HOST}:{settings.API_PORT}/api/docs" if settings.API_DEBUG_MODE else "Contact admin for API documentation"
    }


def main():
    """
    Main entry point for running the application.
    """
    try:
        logger.info("Starting Vision8 Backend server...")
        
        uvicorn.run(
            "main:app",
            host=settings.API_HOST,
            port=settings.API_PORT,
            reload=settings.API_DEBUG_MODE,
            log_level=settings.LOG_LEVEL.lower(),
            access_log=True,
            workers=1 if settings.API_DEBUG_MODE else 4,
            loop="asyncio"
        )
        
    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
