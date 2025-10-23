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
    
    # Audio Processing Configuration
    GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT")
    GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    SPEECH_TO_TEXT_LANGUAGE = os.getenv("SPEECH_TO_TEXT_LANGUAGE", "en-US")
    SPEECH_TO_TEXT_MODEL = os.getenv("SPEECH_TO_TEXT_MODEL", "latest_long")
    SPEECH_TO_TEXT_ENABLE_WORD_TIMESTAMPS = os.getenv("SPEECH_TO_TEXT_ENABLE_WORD_TIMESTAMPS", "true").lower() == "true"
    SPEECH_TO_TEXT_ENABLE_PUNCTUATION = os.getenv("SPEECH_TO_TEXT_ENABLE_PUNCTUATION", "true").lower() == "true"
    
    # Audio Processing Directories
    TEMP_AUDIO_DIR = os.path.join(os.path.dirname(__file__), "..", "temp", "audio")
    EXTRACTED_AUDIO_DIR = os.path.join(os.path.dirname(__file__), "..", "temp", "extracted_audio")

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

            # Initialize Elasticsearch service
            try:
                from services.elastic_service import ElasticService
                self.elasticsearch = ElasticService()
                logger.info("✅ Elasticsearch service initialized")
            except Exception as e:
                logger.error("❌ Failed to initialize Elasticsearch service", error=str(e))
                self.elasticsearch = None

            # Initialize Metadata Generator
            try:
                from services.metadata_generator import MetadataGenerator
                self.metadata_generator = MetadataGenerator()
                logger.info("✅ Metadata generator initialized")
            except Exception as e:
                logger.error("❌ Failed to initialize Metadata generator", error=str(e))
                self.metadata_generator = None

            # Initialize Cache Service
            try:
                from services.cache_service import CacheService
                self.cache_service = CacheService()
                logger.info("✅ Cache service initialized")
            except Exception as e:
                logger.warning("⚠️ Cache service not available, continuing without cache", error=str(e))
                self.cache_service = None

            logger.info("🎉 Service initialization completed")

        except Exception as e:
            logger.error(f"Failed to initialize services: {str(e)}", exc_info=True)
            raise

    async def shutdown(self):
        """Cleanup and shutdown all services."""
        try:
            logger.info("Shutting down application services...")
            
            # Shutdown cache service
            if self.cache_service:
                try:
                    self.cache_service.close()
                    logger.info("✅ Cache service shut down")
                except Exception as e:
                    logger.error("❌ Cache service shutdown failed", error=str(e))
            
            # Shutdown Elasticsearch service
            if self.elasticsearch:
                try:
                    self.elasticsearch.es_client.close()
                    logger.info("✅ Elasticsearch service shut down")
                except Exception as e:
                    logger.error("❌ Elasticsearch service shutdown failed", error=str(e))
            
            logger.info("🎉 All services shut down successfully")

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
        es_healthy = False
        if service_registry.elasticsearch:
            try:
                es_healthy = service_registry.elasticsearch.es_client.ping()
            except Exception as e:
                logger.warning("Elasticsearch ping failed", error=str(e))
        
        # Count active services
        active_services = sum([
            bool(service_registry.elasticsearch),
            bool(service_registry.metadata_generator),
            bool(service_registry.cache_service)
        ])
        
        overall_status = "healthy" if active_services >= 2 else "degraded" if active_services >= 1 else "unhealthy"
        
        return {
            "status": overall_status,
            "version": "1.0.0",
            "services": {
                "elasticsearch": "connected" if es_healthy else "disconnected",
                "metadata_generator": "active" if service_registry.metadata_generator else "inactive",
                "cache_service": "active" if service_registry.cache_service else "inactive"
            },
            "active_services": active_services,
            "total_services": 3
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
from api.audio_transcription_routes import router as audio_router

app.include_router(api_router, prefix="/api/v1")
app.include_router(audio_router)


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
