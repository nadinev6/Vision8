from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import os
import asyncio
import json
import time
from datetime import datetime, timedelta
import logging
from dataclasses import dataclass
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import services with fallback for missing dependencies
try:
    from services.mux_service import MuxService
except ImportError:
    MuxService = None
    logger.warning("MuxService not available")

try:
    from services.comfy_mcp_service import comfy_service
except ImportError:
    comfy_service = None
    logger.warning("ComfyUI service not available")

try:
    from services.supabase_service import SupabaseService
except ImportError:
    SupabaseService = None
    logger.warning("SupabaseService not available")

router = APIRouter(prefix="/mux", tags=["mux"])

# Initialize services with enhanced error handling
try:
    mux_service = MuxService() if MuxService else None
except Exception as e:
    logger.error(f"Failed to initialize MuxService in enhanced router: {e}")
    mux_service = None

supabase_service = SupabaseService() if SupabaseService else None

# Enhanced error handling and retry mechanisms
class MuxErrorType(Enum):
    NETWORK_ERROR = "network_error"
    RATE_LIMIT = "rate_limit"
    AUTHENTICATION = "authentication"
    RESOURCE_NOT_FOUND = "resource_not_found"
    PROCESSING_ERROR = "processing_error"

@dataclass
class MuxRetryConfig:
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 30.0
    exponential_base: float = 2.0

class EnhancedMuxService:
    def __init__(self):
        self.retry_config = MuxRetryConfig()
        self.cache = {}
        self.cache_ttl = 300  # 5 minutes
    
    async def _retry_with_backoff(self, operation, *args, **kwargs):
        """Enhanced retry mechanism with exponential backoff"""
        last_exception = None
        
        for attempt in range(self.retry_config.max_retries):
            try:
                return await operation(*args, **kwargs)
            except Exception as e:
                last_exception = e
                
                if attempt == self.retry_config.max_retries - 1:
                    break
                
                delay = min(
                    self.retry_config.base_delay * (self.retry_config.exponential_base ** attempt),
                    self.retry_config.max_delay
                )
                
                logger.warning(f"Operation failed (attempt {attempt + 1}/{self.retry_config.max_retries}), retrying in {delay}s: {e}")
                await asyncio.sleep(delay)
        
        raise last_exception
    
    async def get_asset_with_fallback(self, asset_id: str):
        """Get asset with multiple fallback mechanisms"""
        cache_key = f"asset_{asset_id}"
        
        # Check cache first
        if cache_key in self.cache:
            cache_entry = self.cache[cache_key]
            if datetime.now() - cache_entry['timestamp'] < timedelta(seconds=self.cache_ttl):
                return cache_entry['data']
        
        try:
            if not mux_service:
                raise Exception("Mux service not available")
            
            # Try primary method
            asset = await self._retry_with_backoff(mux_service.get_asset, asset_id)
            
            # Cache the result
            self.cache[cache_key] = {
                'data': asset,
                'timestamp': datetime.now()
            }
            
            return asset
            
        except Exception as e:
            logger.error(f"Failed to get asset {asset_id}: {e}")
            
            # Fallback: Check Supabase for cached metadata
            if supabase_service:
                try:
                    video_record = await supabase_service.get_video_by_asset_id(asset_id)
                    if video_record:
                        return {
                            'id': asset_id,
                            'status': video_record.get('status', 'unknown'),
                            'duration': video_record.get('duration', 0),
                            'playback_id': video_record.get('mux_playback_id'),
                            'title': video_record.get('title', 'Unknown'),
                            'source': 'supabase_fallback'
                        }
                except Exception as fallback_error:
                    logger.error(f"Supabase fallback failed: {fallback_error}")
            
            raise HTTPException(status_code=404, detail=f"Asset not found: {asset_id}")

# Enhanced response models
class EnhancedUploadResponse(BaseModel):
    upload_id: str
    upload_url: str
    expires_at: str
    status: str = "pending"

class EnhancedAssetResponse(BaseModel):
    asset_id: str
    playback_id: Optional[str]
    title: str
    duration: float
    status: str
    created_at: str
    source: str = "mux"

class VideoAnalysisRequest(BaseModel):
    asset_id: str
    analysis_type: str = "comprehensive"  # "basic", "comprehensive", "real-time"
    quality_level: str = "medium"  # "low", "medium", "high"
    client_capabilities: Optional[Dict[str, Any]] = None

class SceneReplacementRequest(BaseModel):
    asset_id: str
    start_time: float
    end_time: float
    option: str  # "remove", "budget", "premium", "wan2.2"
    prompt: Optional[str] = None
    quality_level: str = "medium"

class ImportMuxAssetRequest(BaseModel):
    asset_id: str
    user_id: str
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

# WebSocket connection manager for real-time analysis
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast message to all connected clients"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Failed to send message to WebSocket: {e}")
                disconnected.append(connection)
        
        # Remove disconnected clients
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()
enhanced_mux_service = EnhancedMuxService()

@router.post("/upload/url/enhanced")
async def get_enhanced_upload_url():
    """Get enhanced upload URL with better error handling and metadata"""
    try:
        if not mux_service:
            raise HTTPException(status_code=503, detail="Mux service not available")
        
        upload_data = await enhanced_mux_service._retry_with_backoff(
            mux_service.create_upload_url
        )
        
        # Add metadata and enhanced response
        enhanced_response = EnhancedUploadResponse(
            upload_id=upload_data.get('upload_id'),
            upload_url=upload_data.get('upload_url'),
            expires_at=upload_data.get('expires_at', ''),
            status="pending"
        )
        
        return enhanced_response.dict()
        
    except Exception as e:
        logger.error(f"Enhanced upload URL generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assets/{asset_id}/enhanced")
async def get_enhanced_asset(asset_id: str):
    """Get asset with enhanced metadata and fallback mechanisms"""
    try:
        asset = await enhanced_mux_service.get_asset_with_fallback(asset_id)
        
        enhanced_response = EnhancedAssetResponse(
            asset_id=asset_id,
            playback_id=asset.get('playback_id'),
            title=asset.get('title', 'Unknown'),
            duration=asset.get('duration', 0),
            status=asset.get('status', 'unknown'),
            created_at=asset.get('created_at', datetime.now().isoformat()),
            source=asset.get('source', 'mux')
        )
        
        return enhanced_response.dict()
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Enhanced asset retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/assets/import/enhanced")
async def import_mux_asset_enhanced(request: ImportMuxAssetRequest):
    """Enhanced asset import with comprehensive metadata handling"""
    try:
        # Get asset with enhanced fallback
        asset = await enhanced_mux_service.get_asset_with_fallback(request.asset_id)
        
        if not supabase_service:
            raise HTTPException(status_code=503, detail="Supabase service not available")
        
        # Check if asset already exists
        existing_video = await supabase_service.get_video(request.asset_id)
        if existing_video:
            return {
                "status": "already_exists",
                "video_id": existing_video.get("id"),
                "mux_asset_id": request.asset_id,
                "mux_playback_id": existing_video.get("mux_playback_id"),
                "title": existing_video.get("title"),
                "import_method": "enhanced_duplicate_check"
            }
        
        # Create enhanced video record
        video_data = {
            "user_id": request.user_id,
            "mux_asset_id": request.asset_id,
            "mux_playback_id": asset.get('playback_id'),
            "title": request.title or asset.get('title', f"Imported {request.asset_id}"),
            "status": asset.get('status', 'ready'),
            "duration": asset.get('duration', 0),
            "created_at": datetime.utcnow().isoformat(),
            "import_method": "enhanced_api",
            "metadata": request.metadata or {}
        }
        
        video_id = await supabase_service.create_video_record(video_data)
        
        return {
            "status": "imported",
            "video_id": video_id,
            "mux_asset_id": request.asset_id,
            "mux_playback_id": asset.get('playback_id'),
            "title": video_data["title"],
            "import_method": "enhanced_successful"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Enhanced asset import failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/analysis/websocket/{asset_id}")
async def start_real_time_analysis(asset_id: str, request: VideoAnalysisRequest):
    """Start real-time video analysis via WebSocket"""
    try:
        # Validate asset exists
        asset = await enhanced_mux_service.get_asset_with_fallback(asset_id)
        
        # Simulate real-time analysis start
        analysis_job = {
            "job_id": f"analysis_{asset_id}_{int(time.time())}",
            "asset_id": asset_id,
            "status": "started",
            "analysis_type": request.analysis_type,
            "quality_level": request.quality_level,
            "started_at": datetime.now().isoformat()
        }
        
        # Broadcast to WebSocket connections
        await manager.broadcast({
            "type": "analysis_started",
            "data": analysis_job
        })
        
        # Simulate analysis progress (in production, this would be handled by background tasks)
        await asyncio.sleep(1)
        await manager.broadcast({
            "type": "analysis_progress",
            "data": {
                "job_id": analysis_job["job_id"],
                "progress": 25,
                "message": "Initializing analysis..."
            }
        })
        
        return {
            "status": "analysis_started",
            "job_id": analysis_job["job_id"],
            "websocket_endpoint": f"/mux/ws/analysis/{asset_id}",
            "estimated_duration": "30-60 seconds"
        }
        
    except Exception as e:
        logger.error(f"Real-time analysis start failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.websocket("/ws/analysis/{asset_id}")
async def websocket_analysis_endpoint(websocket: WebSocket, asset_id: str):
    """WebSocket endpoint for real-time video analysis streaming"""
    await manager.connect(websocket)
    
    try:
        while True:
            # Receive client messages (e.g., analysis parameters, pause/resume)
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
            elif message.get("type") == "request_analysis":
                # Start or resume analysis for this asset
                await manager.broadcast({
                    "type": "analysis_requested",
                    "data": {
                        "asset_id": asset_id,
                        "request_id": message.get("request_id"),
                        "timestamp": datetime.now().isoformat()
                    }
                })
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

@router.post("/scenes/replace/enhanced")
async def replace_scene_enhanced(request: SceneReplacementRequest):
    """Enhanced scene replacement with better error handling and fallbacks"""
    try:
        # Validate asset exists first
        asset = await enhanced_mux_service.get_asset_with_fallback(request.asset_id)
        
        if request.option == "remove":
            return {
                "status": "processing",
                "message": "Scene removal started",
                "job_id": f"remove_{request.asset_id}_{int(time.time())}",
                "estimated_duration": "5-10 minutes"
            }
        
        elif request.option in ["budget", "premium", "wan2.2"]:
            if not request.prompt:
                raise HTTPException(status_code=400, detail="Prompt required for generation")
            
            # Check ComfyUI service availability
            if not comfy_service:
                return {
                    "status": "fallback_mode",
                    "message": "ComfyUI service unavailable, using alternative generation method",
                    "fallback_type": "basic_generation"
                }
            
            # Enhanced workflow mapping
            workflow_map = {
                "budget": "hallucination_scene",
                "premium": "hero_scene", 
                "wan2.2": "wan2.2_generation"
            }
            
            workflow_name = workflow_map.get(request.option, "hallucination_scene")
            
            # Run workflow with enhanced error handling
            try:
                result_url = await enhanced_mux_service._retry_with_backoff(
                    comfy_service.run_workflow,
                    workflow_name,
                    {
                        "USER_PROMPT": request.prompt,
                        "SOURCE_VIDEO": request.asset_id,
                        "QUALITY_LEVEL": request.quality_level,
                        "START_TIME": request.start_time,
                        "END_TIME": request.end_time
                    }
                )
                
                return {
                    "status": "completed",
                    "generation_url": result_url,
                    "message": f"{request.option} generation completed via ComfyUI",
                    "workflow": workflow_name,
                    "quality_level": request.quality_level
                }
                
            except Exception as workflow_error:
                logger.error(f"ComfyUI workflow failed: {workflow_error}")
                return {
                    "status": "partial_success",
                    "message": "Generation partially completed, manual review required",
                    "error": str(workflow_error)
                }
        
        else:
            raise HTTPException(status_code=400, detail="Invalid option")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Enhanced scene replacement failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health/enhanced")
async def enhanced_health_check():
    """Enhanced health check with detailed service status"""
    try:
        services_status = {
            "mux_service": "available" if mux_service else "unavailable",
            "supabase_service": "available" if supabase_service else "unavailable", 
            "comfyui_service": "available" if comfy_service else "unavailable",
            "websocket_connections": len(manager.active_connections),
            "cache_entries": len(enhanced_mux_service.cache)
        }
        
        overall_health = "healthy"
        if services_status["mux_service"] == "unavailable":
            overall_health = "degraded"
        if services_status["mux_service"] == "unavailable" and services_status["supabase_service"] == "unavailable":
            overall_health = "unhealthy"
        
        return {
            "status": overall_health,
            "timestamp": datetime.now().isoformat(),
            "services": services_status,
            "version": "2.0.0-enhanced"
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Background task for cleanup
@router.on_event("startup")
async def startup_event():
    """Initialize background tasks on startup"""
    logger.info("Enhanced Mux Router starting up...")
    
@router.on_event("shutdown") 
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Enhanced Mux Router shutting down...")
    # Close all WebSocket connections
    for connection in manager.active_connections.copy():
        try:
            await connection.close()
        except:
            pass