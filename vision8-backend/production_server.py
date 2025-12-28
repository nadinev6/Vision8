"""Production Vision8 Backend - Fixed Routing Issues"""

import os
import sys
from contextlib import asynccontextmanager
from typing import Dict, Any

# Add the src directory to Python path for proper imports
current_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.join(current_dir, "src")
sys.path.insert(0, src_dir)
sys.path.insert(0, current_dir)

import uvicorn
import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv
from datetime import datetime

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

# Simple logging setup
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
    """Application lifespan manager for startup and shutdown events."""
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
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)

# Add GZip compression middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

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

# Root endpoint
@app.get("/", tags=["System"])
async def root() -> Dict[str, str]:
    """Root endpoint with API information."""
    return {
        "name": "Vision8 Backend API - Production",
        "version": "1.0.0",
        "description": "Intelligent video processing and AI-powered scene generation",
        "documentation": f"{settings.API_BASE_URL}/api/docs",
        "status_endpoint": f"{settings.API_BASE_URL}/health"
    }

# Include API routes with error handling
try:
    from api.routes import router as api_router
    app.include_router(api_router, prefix="/api/v1")
    logger.info("Main API routes loaded")
except Exception as e:
    logger.error(f"Failed to load main API routes: {str(e)}")

try:
    from api.video_analysis_routes import router as video_analysis_router
    app.include_router(video_analysis_router, prefix="/api/v1")
    logger.info("Video analysis routes loaded")
except Exception as e:
    logger.error(f"Failed to load video analysis routes: {str(e)}")

try:
    from api.mux_router import router as mux_router
    app.include_router(mux_router, prefix="/api/v1")
    logger.info("Mux integration routes loaded")
except Exception as e:
    logger.error(f"Failed to load Mux integration routes: {str(e)}")

try:
    from api.mcp_router import router as mcp_router
    app.include_router(mcp_router, prefix="/api/mcp")
    logger.info("MCP Server routes loaded")
except Exception as e:
    logger.error(f"Failed to load MCP Server routes: {str(e)}")

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
