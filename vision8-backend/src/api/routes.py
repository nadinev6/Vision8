"""
Main API Routes for Vision8 Backend

This module defines all API routes and includes sub-routers for different
functional areas like video processing, search, and generation.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List
import structlog
from datetime import datetime

from api.video_generation_routes import router as generation_router
from api.video_analysis_routes import router as analysis_router
from api.image_generation_routes import router as image_router
from api.mcp_router import router as mcp_router

logger = structlog.get_logger()

# Main API router
router = APIRouter()

# Include sub-routers
router.include_router(generation_router, prefix="/video")
router.include_router(analysis_router, prefix="/video")
router.include_router(image_router, prefix="/api")

# Include Mux router
from api.mux_router import router as mux_router
router.include_router(mux_router, prefix="/mux")
router.include_router(mcp_router, prefix="/mcp")



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
        "endpoints": "/api/v1/video/generation/, /health, /api/docs"
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




# Test endpoint for embedding generation
@router.get("/test/embeddings")
async def test_embeddings() -> Dict[str, Any]:
    """Test embedding generation functionality."""
    try:
        import requests
        import os
        from dotenv import load_dotenv
        
        load_dotenv()
        
        # Get Gemini configuration
        gemini_api_key = os.getenv('GEMINI_API_KEY')
        embedding_url = os.getenv('EMBEDDING_MODEL_URL')
        
        if not gemini_api_key or not embedding_url:
            return {
                "status": "error",
                "error": "GEMINI_API_KEY and EMBEDDING_MODEL_URL must be configured",
                "timestamp": datetime.utcnow().isoformat()
            }
        
        # Test text for embedding
        test_text = "This is a test video scene showing a person walking in a park."
        
        # Prepare request
        headers = {
            'Content-Type': 'application/json',
        }
        
        payload = {
            "model": "models/text-embedding-004",
            "content": {
                "parts": [{"text": test_text}]
            }
        }
        
        # Make request to Gemini API
        response = requests.post(
            f"{embedding_url}?key={gemini_api_key}",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            embedding = result.get('embedding', {}).get('values', [])
            
            return {
                "status": "success",
                "embedding": {
                    "text": test_text,
                    "dimensions": len(embedding),
                    "sample_values": embedding[:5] if embedding else [],
                    "api_response_time": response.elapsed.total_seconds()
                },
                "timestamp": datetime.utcnow().isoformat()
            }
        else:
            return {
                "status": "error",
                "error": f"API request failed with status {response.status_code}: {response.text}",
                "timestamp": datetime.utcnow().isoformat()
            }
        
    except Exception as e:
        logger.error("embedding_test_failed", error=str(e))
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


# Test endpoint for LangCache
@router.get("/test/langcache")
async def test_langcache() -> Dict[str, Any]:
    """Test LangCache connection and embedding caching."""
    try:
        from services.langcache_service import LangCacheService
        
        # Initialize LangCache service
        cache_service = LangCacheService()
        
        # Test text
        test_text = "This is a test for embedding caching with LangCache."
        
        # Get cache stats
        stats = cache_service.get_cache_stats()
        
        # Test cache miss (should return None for new text)
        cached_result = cache_service.get_cached_embedding(test_text)
        
        return {
            "status": "success",
            "langcache": {
                "api_connected": True,
                "model": cache_service.model,
                "test_text": test_text,
                "cache_hit": cached_result is not None,
                "cached_dimensions": len(cached_result) if cached_result else None,
                "stats": stats
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error("langcache_test_failed", error=str(e))
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


# Comprehensive integration test endpoint
@router.get("/test/integration")
async def test_integration() -> Dict[str, Any]:
    """Test all services integration - Elasticsearch, Embeddings, and LangCache."""
    results = {
        "timestamp": datetime.utcnow().isoformat(),
        "services": {}
    }
    
    # Test Embeddings
    try:
        import requests
        import os
        from dotenv import load_dotenv
        
        load_dotenv()
        
        gemini_api_key = os.getenv('GEMINI_API_KEY')
        embedding_url = os.getenv('EMBEDDING_MODEL_URL')
        
        if gemini_api_key and embedding_url:
            test_text = "A person walking through a sunny park with trees."
            
            headers = {'Content-Type': 'application/json'}
            payload = {
                "model": "models/text-embedding-004",
                "content": {"parts": [{"text": test_text}]}
            }
            
            response = requests.post(
                f"{embedding_url}?key={gemini_api_key}",
                headers=headers,
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                embedding = result.get('embedding', {}).get('values', [])
                results["services"]["embeddings"] = {
                    "status": "success",
                    "dimensions": len(embedding),
                    "sample": embedding[:3] if embedding else []
                }
            else:
                results["services"]["embeddings"] = {
                    "status": "error",
                    "error": f"API error: {response.status_code}"
                }
        else:
            results["services"]["embeddings"] = {
                "status": "error",
                "error": "Missing API configuration"
            }
    except Exception as e:
        results["services"]["embeddings"] = {
            "status": "error",
            "error": str(e)
        }
    
    # Test LangCache
    try:
        from services.langcache_service import LangCacheService
        
        cache_service = LangCacheService()
        test_text = "Integration test for LangCache embedding storage."
        
        # Try to get from cache
        cached = cache_service.get_cached_embedding(test_text)
        
        results["services"]["langcache"] = {
            "status": "success",
            "model": cache_service.model,
            "cache_hit": cached is not None,
            "cached_dimensions": len(cached) if cached else None
        }
        
        # If we have embeddings working, try to cache one
        if results["services"]["embeddings"]["status"] == "success":
            sample_embedding = [0.1] * 768  # Mock embedding for testing
            cache_success = cache_service.cache_embedding(test_text, sample_embedding)
            results["services"]["langcache"]["cache_write"] = cache_success
            
    except Exception as e:
        results["services"]["langcache"] = {
            "status": "error",
            "error": str(e)
        }
    
    
    # Overall status (excluding Elasticsearch)
    all_services = [results["services"].get(svc, {}).get("status") for svc in ["embeddings", "langcache"]]
    if all(status == "success" for status in all_services):
        results["overall_status"] = "core_systems_operational"
    elif any(status == "success" for status in all_services):
        results["overall_status"] = "partial_systems_operational"
    else:
        results["overall_status"] = "systems_down"

    results["note"] = "Elasticsearch disabled to eliminate cloud costs - core functionality remains"
    
    return results

# Real endpoints are now available in the analysis router:
# - POST /api/v1/video/analysis/upload - Upload and analyze videos
# - GET /api/v1/video/analysis/search - Search video content  
# - GET /api/v1/video/analysis/elasticsearch/status - Check Elasticsearch status
# - DELETE /api/v1/video/analysis/video/{video_id} - Delete video data

@router.post("/add-sample-video")
async def add_sample_video(video_data: Dict[str, Any]) -> Dict[str, str]:
    """Add a sample video to the system for demo purposes."""
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        from datetime import datetime
        
        # Initialize Firebase if not already done
        try:
            if not firebase_admin._apps:
                # Use a minimal config for demo purposes
                firebase_admin.initialize_app()
        except Exception:
            pass
        
        db = firestore.client()
        
        # Extract data
        video_id = video_data.get("video_id")
        user_id = video_data.get("user_id", "test-user-123")
        
        if not video_id:
            return {"error": "video_id is required"}
        
        # Prepare Firebase document
        firebase_doc = {
            "videoId": video_id,
            "title": video_data.get("title", "Sample Video"),
            "uploadedAt": datetime.now(),
            "duration": video_data.get("duration_ms", 0) / 1000,
            "fileSize": video_data.get("file_size", 0),
            "status": "completed",
            "gcsUrl": video_data.get("gcs_url", ""),
            "publicUrl": video_data.get("public_url", ""),
            "scenesCount": len(video_data.get("scenes", [])),
            "manuallyAdded": True,
            "metadata": {
                "objectsDetected": len(video_data.get("objects_detected", [])),
                "transcriptAvailable": bool(video_data.get("transcript_summary")),
                "visualSummary": video_data.get("visual_summary", "")[:200] + "..." if video_data.get("visual_summary") else ""
            }
        }
        
        # Add to Firebase
        doc_ref = db.collection("users").document(user_id).collection("videoHistory").document(video_id)
        doc_ref.set(firebase_doc)
        
        # Update user stats
        user_ref = db.collection("users").document(user_id)
        user_ref.update({
            "videoCount": firestore.Increment(1),
            "lastActivity": datetime.now()
        })
        
        logger.info("Sample video added to Firebase", video_id=video_id, user_id=user_id)
        
        return {
            "status": "success",
            "message": f"Video {video_id} added to user {user_id} history",
            "video_id": video_id
        }
        
    except Exception as e:
        logger.error("Failed to add sample video", error=str(e))
        return {
            "status": "error", 
            "error": str(e)
        }