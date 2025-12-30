"""Production Vision8 Backend - Fixed Routing Issues"""

import os
import sys
from contextlib import asynccontextmanager
from typing import Dict, Any

# Add the src directory to Python path for proper imports
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)  # vision8-backend directory
src_dir = current_dir  # This is already the src directory
sys.path.insert(0, src_dir)
sys.path.insert(0, parent_dir)

import uvicorn
import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv
from datetime import datetime, UTC

# Load environment variables
load_dotenv()

# Simple settings for production
class SimpleSettings:
    API_HOST = os.getenv("API_HOST", "0.0.0.0")
    API_PORT = int(os.getenv("API_PORT", 8000))
    API_DEBUG_MODE = os.getenv("API_DEBUG_MODE", "false").lower() == "true"
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    API_BASE_URL = os.getenv("API_BASE_URL", f"http://{os.getenv('API_HOST', '0.0.0.0')}:{os.getenv('API_PORT', 8000)}")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001,http://localhost:5173,https://vision8-e7683.web.app,https://vision8-e7683.firebaseapp.com").split(",")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash-preview-05-20")

    @classmethod
    def validate_config(cls):
        missing_vars = []
        if not cls.GEMINI_API_KEY:
            missing_vars.append("GEMINI_API_KEY")
        if missing_vars:
            print(f"Warning: Missing environment variables: {missing_vars}")
            return False
        return True

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
        self.metadata_generator = None
        self.conversation_handler = None
        self.cache_service = None
        self.supabase_service = None

    async def initialize(self):
        """Initialize all application services."""
        try:
            logger.info("Initializing application services...")

            # Initialize Metadata Generator
            try:
                from services.metadata_generator import MetadataGenerator
                self.metadata_generator = MetadataGenerator()
                logger.info("Metadata generator initialized")
            except Exception as e:
                logger.error(f"Failed to initialize Metadata generator: {str(e)}")
                self.metadata_generator = None

            # Initialize Cache Service
            try:
                from services.cache_service import CacheService
                self.cache_service = CacheService()
                logger.info("Cache service initialized")
            except Exception as e:
                logger.warning(f"Cache service not available, continuing without cache: {str(e)}")
                self.cache_service = None

            # Initialize Supabase Service
            try:
                from services.supabase_service import SupabaseService
                self.supabase_service = SupabaseService()
                if self.supabase_service.is_available():
                    logger.info("Supabase service initialized successfully")
                else:
                    logger.warning("Supabase service not available - video search will be disabled")
                    self.supabase_service = None
            except Exception as e:
                logger.warning(f"Supabase service not available, continuing without video search: {str(e)}")
                self.supabase_service = None

            logger.info("Service initialization completed")

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
                    logger.info("Cache service shut down")
                except Exception as e:
                    logger.error(f"Cache service shutdown failed: {str(e)}")

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
        # Validate configuration
        if not settings.validate_config():
            logger.warning("Some environment variables are missing - services may be limited")
        
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
    docs_url="/api/docs",  # Always enable docs for production API access
    redoc_url="/api/redoc",  # Always enable redoc for production API access
    lifespan=lifespan
)


# Configure CORS for production - Enhanced for search functionality
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Content-Language",
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-Request-ID",
        "Cache-Control",
        "Pragma"
    ],
    expose_headers=[
        "Content-Type",
        "Content-Length",
        "X-Request-ID"
    ],
    max_age=86400,  # 24 hours
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
        client_host=request.client.host if request.client else None,
        origin=request.headers.get("origin")
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
    try:
        return {
            "status": "healthy",
            "version": "1.0.0",
            "services": {
                "metadata_generator": "active" if service_registry.metadata_generator else "inactive",
                "cache_service": "active" if service_registry.cache_service else "inactive",
                "supabase_service": "active" if service_registry.supabase_service else "inactive"
            },
            "total_services": 3,
            "note": "Production Vision8 Backend"
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

# CORS test endpoint
@app.get("/cors-test", tags=["System"])
async def cors_test(request: Request) -> Dict[str, Any]:
    """
    Comprehensive CORS configuration test endpoint.
    """
    return {
        "message": "CORS is working!",
        "timestamp": datetime.utcnow().isoformat(),
        "cors_config": {
            "origins": settings.CORS_ORIGINS,
            "debug_mode": settings.API_DEBUG_MODE,
            "allow_credentials": False,
            "allow_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"]
        },
        "request_info": {
            "method": request.method,
            "origin": request.headers.get("origin"),
            "host": request.headers.get("host"),
            "user_agent": request.headers.get("user-agent", "")[:100],
            "headers": dict(request.headers)
        }
    }

# Simple API test endpoint
@app.get("/api/test", tags=["System"])
async def api_test() -> Dict[str, Any]:
    """
    Simple API test endpoint to verify the API is working.
    """
    return {
        "message": "Vision8 Backend API is operational",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "environment": "production" if not settings.API_DEBUG_MODE else "development",
        "services_available": {
            "metadata_generator": service_registry.metadata_generator is not None,
            "cache_service": service_registry.cache_service is not None
        }
    }

try:
    from api.routes import router as api_router
    app.include_router(api_router, prefix="/api/v1")
    logger.info("✅ Main API routes loaded")
except Exception as e:
    logger.error("❌ Failed to load main API routes", error=str(e))

try:
    from api.comfy_router import router as comfy_router
    app.include_router(comfy_router)
    logger.info("✅ ComfyUI routes loaded")
except Exception as e:
    logger.error("❌ Failed to load ComfyUI routes", error=str(e))

try:
    from api.mux_router_enhanced import router as mux_router
    app.include_router(mux_router)
    logger.info("✅ Enhanced Mux routes loaded")
except Exception as e:
    logger.error("❌ Failed to load Enhanced Mux routes", error=str(e))
    try:
        from api.mux_router import router as mux_router_basic
        app.include_router(mux_router_basic)
        logger.info("✅ Basic Mux routes loaded (fallback)")
    except Exception as e2:
        logger.error("❌ Failed to load Basic Mux routes", error=str(e2))

# MCP Server routes are now included via the main api_router in api/routes.py


# API Status endpoint
@app.get("/api/status", tags=["System"])
async def api_status() -> Dict[str, Any]:
    """
    API status endpoint with comprehensive information.
    """
    try:
        return {
            "name": "Vision8 Backend API",
            "version": "1.0.0",
            "status": "operational",
            "description": "Intelligent video processing and AI-powered scene generation (Elasticsearch disabled)",
            "documentation": f"{settings.API_BASE_URL}/api/docs",
            "redoc": f"{settings.API_BASE_URL}/api/redoc",
            "endpoints": {
                "health": f"{settings.API_BASE_URL}/health",
                "cors_test": f"{settings.API_BASE_URL}/cors-test",
                "video_analysis": f"{settings.API_BASE_URL}/api/v1/analysis/upload",
                "search": f"{settings.API_BASE_URL}/api/v1/analysis/search"
            },
            "services": {
                "metadata_generator": "active" if service_registry.metadata_generator else "inactive",
                "cache_service": "active" if service_registry.cache_service else "inactive"
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "name": "Vision8 Backend API",
            "version": "1.0.0",
            "status": "error",
            "error": str(e),
            "documentation": f"{settings.API_BASE_URL}/api/docs",
            "timestamp": datetime.utcnow().isoformat()
        }

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
        "documentation": f"{settings.API_BASE_URL}/api/docs",
        "status_endpoint": f"{settings.API_BASE_URL}/api/status"
    }


def main():
    """Main entry point for running the application."""
    try:
        logger.info("Starting Vision8 Backend server...")

        uvicorn.run(
            app,
            host=settings.API_HOST,
            port=settings.API_PORT,
            log_level=settings.LOG_LEVEL.lower(),
            access_log=True,
            loop="asyncio"
        )

    except KeyboardInterrupt:
        logger.info("Received shutdown signal")
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
