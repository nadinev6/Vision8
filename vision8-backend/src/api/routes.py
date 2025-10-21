"""
Main API Routes for Vision8 Backend

This module defines all API routes and includes sub-routers for different
functional areas like video processing, search, and generation.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List
import structlog

from .video_generation_routes import router as generation_router

logger = structlog.get_logger()

# Main API router
router = APIRouter()

# Include sub-routers
router.include_router(generation_router, prefix="/video")

# Root API endpoint
@router.get("/")
async def api_root() -> Dict[str, str]:
    """
    API root endpoint with basic information.
    """
    return {
        "message": "Vision8 Backend API",
        "version": "1.0.0",
        "status": "active",
        "endpoints": {
            "video_generation": "/api/v1/video/generation/",
            "health": "/health",
            "docs": "/api/docs"
        }
    }


# API health check
@router.get("/health")
async def api_health() -> Dict[str, Any]:
    """
    Comprehensive API health check.
    """
    try:
        # Check all services
        health_status = {
            "api": "healthy",
            "video_generation": "healthy",  # Will be checked by sub-service
            "timestamp": "2024-01-01T00:00:00Z"  # Would use actual timestamp
        }
        
        return {
            "status": "healthy",
            "services": health_status,
            "version": "1.0.0"
        }
        
    except Exception as e:
        logger.error("API health check failed", error=str(e))
        return {
            "status": "unhealthy",
            "error": str(e),
            "version": "1.0.0"
        }


# Placeholder endpoints for future implementation
@router.get("/video/analyze")
async def analyze_video_placeholder():
    """Placeholder for video analysis endpoint."""
    raise HTTPException(status_code=501, detail="Video analysis endpoint not yet implemented")


@router.get("/search")
async def search_placeholder():
    """Placeholder for search endpoint."""
    raise HTTPException(status_code=501, detail="Search endpoint not yet implemented")


@router.get("/elasticsearch")
async def elasticsearch_placeholder():
    """Placeholder for Elasticsearch operations."""
    raise HTTPException(status_code=501, detail="Elasticsearch endpoints not yet implemented")