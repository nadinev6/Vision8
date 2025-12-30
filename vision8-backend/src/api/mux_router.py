from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os 

# Try to import services with fallback for missing dependencies
from services.mux_service import MuxService

from services.comfy_mcp_service import comfy_service

from services.supabase_service import SupabaseService

router = APIRouter(prefix="/mux", tags=["mux"])

# Initialize services with error handling
try:
    mux_service = MuxService() if MuxService else None
except Exception as e:
    logger.error(f"Failed to initialize MuxService in router: {e}")
    mux_service = None

supabase_service = SupabaseService() if SupabaseService else None

# Log service initialization status
import structlog
logger = structlog.get_logger()
logger.info("Mux Router initialized", mux_service_available=bool(mux_service), supabase_service_available=bool(supabase_service))

class SceneReplacementRequest(BaseModel):
    asset_id: str
    start_time: float
    end_time: float
    option: str # "remove", "budget", "premium", "wan2.2"
    prompt: Optional[str] = None

class ImportMuxAssetRequest(BaseModel):
    asset_id: str
    user_id: str
    title: Optional[str] = None

@router.post("/upload/url")
async def get_upload_url():
    """Get direct upload URL for browser uploads"""
    try:
        if not mux_service:
            raise HTTPException(status_code=503, detail="Mux service not available")
        return await mux_service.create_upload_url()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assets")
async def list_assets():
    """List recent assets"""
    try:
        if not mux_service:
            raise HTTPException(status_code=503, detail="Mux service not available")
        return await mux_service.list_assets()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/assets/import")
async def import_mux_asset(request: ImportMuxAssetRequest):
    """
    Import an existing Mux asset by asset_id.
    Creates Supabase record linking the asset to the user.
    """
    from datetime import datetime
    
    try:
        if not mux_service:
            raise HTTPException(status_code=503, detail="Mux service not available")
        
        if not supabase_service:
            raise HTTPException(status_code=503, detail="Supabase service not available")
        
        # Check if asset already exists in Supabase
        existing_video = await supabase_service.get_video(request.asset_id)
        if existing_video:
            return {
                "status": "already_exists",
                "video_id": existing_video.get("id"),
                "mux_asset_id": request.asset_id
            }
        
        # Fetch asset from Mux
        asset = await mux_service.get_asset(request.asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found in Mux")
        
        # Get playback ID
        playback_id = await mux_service.get_playback_id(request.asset_id)
        
        # Get asset title from Mux or use provided title
        title = request.title or getattr(asset, 'name', None) or f"Imported {request.asset_id}"
        
        # Get duration from asset
        duration = getattr(asset, 'duration', 0) or 0
        
        # Create Supabase record
        video_data = {
            "user_id": request.user_id,
            "mux_asset_id": request.asset_id,
            "mux_playback_id": playback_id,
            "title": title,
            "status": "ready",
            "duration": duration,
            "created_at": datetime.utcnow().isoformat()
        }
        
        video_id = await supabase_service.create_video_record(video_data)
        
        return {
            "status": "imported",
            "video_id": video_id,
            "mux_asset_id": request.asset_id,
            "mux_playback_id": playback_id,
            "title": title
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/global")
async def get_global_analytics(timeframe: Optional[str] = "7:days"):
    """Get global analytics data from Mux (Data API)"""
    try:
        if not mux_service:
            # Return mock data if service not available
            return {
                "total_watch_time": {"value": 0, "formatted": "0s"},
                "unique_viewers": {"value": 0},
                "period": timeframe,
                "status": "service_unavailable"
            }
        data = await mux_service.get_real_analytics([timeframe])
        if not data:
            return {
                "total_watch_time": {"value": 0, "formatted": "0s"},
                "unique_viewers": {"value": 0},
                "period": timeframe,
                "status": "mock_or_empty"
            }
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/user-assets")
async def get_user_assets_with_engagement(timeframe: Optional[str] = "7:days"):
    """Get all assets for the current user with engagement metrics"""
    try:
        if not mux_service:
            raise HTTPException(status_code=503, detail="Mux service not available")

        # In a real implementation, we would get the user_id from authentication
        # For now, we'll fetch all assets (simulating a single user scenario)
        assets_with_engagement = await mux_service.get_user_assets_with_engagement(timeframe=[timeframe])

        return {
            "status": "success",
            "assets": assets_with_engagement,
            "period": timeframe
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assets/{asset_id}/engagement")
async def get_asset_engagement(asset_id: str, timeframe: Optional[str] = "7:days"):
    """Get engagement metrics for a specific asset"""
    try:
        if not mux_service:
            raise HTTPException(status_code=503, detail="Mux service not available")

        engagement_data = await mux_service.get_asset_with_engagement(asset_id, timeframe=[timeframe])

        if not engagement_data:
            raise HTTPException(status_code=404, detail="Asset not found or no engagement data available")

        return {
            "status": "success",
            "asset_id": asset_id,
            "engagement": engagement_data["engagement"],
            "period": timeframe
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@router.post("/assets/{asset_id}/refresh")
async def refresh_asset_metadata(asset_id: str):
    """Refresh metadata for a specific asset (useful after upload completes)"""
    try:
        if not mux_service:
            raise HTTPException(status_code=503, detail="Mux service not available")

        # Get the latest asset data from Mux
        asset = await mux_service.get_asset(asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")

        # Get playback ID
        playback_id = await mux_service.get_playback_id(asset_id)

        return {
            "status": "success",
            "asset_id": asset_id,
            "playback_id": playback_id,
            "title": getattr(asset, 'name', f"Video {asset_id}"),
            "duration": getattr(asset, 'duration', 0),
            "status": getattr(asset, 'status', 'unknown')
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/scenes/replace")
async def replace_scene(request: SceneReplacementRequest):
    """Replace a scene with AI-generated content"""
    try:
        if request.option == "remove":
            return {"status": "processing", "message": "Scene removal started"}
        
        elif request.option in ["budget", "premium"]:
            if not request.prompt:
                raise HTTPException(status_code=400, detail="Prompt required for generation")
            
            # Trigger ComfyUI generation if available
            workflow_map = {
                "budget": "hallucination_scene",
                "premium": "hero_scene",
                "wan2.2": "hero_scene"
            }
            
            workflow_name = workflow_map.get(request.option, "hallucination_scene")
            
            if not comfy_service:
                return {
                    "status": "error", 
                    "message": "ComfyUI service not available for generation"
                }
                
            result_url = await comfy_service.run_workflow(workflow_name, {
                "USER_PROMPT": request.prompt,
                "SOURCE_VIDEO": None
            })
                
            return {
                "status": "completed", 
                "generation_url": result_url, 
                "message": f"{request.option} generation completed via ComfyUI"
            }
            
        else:
            raise HTTPException(status_code=400, detail="Invalid option")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhook")
async def mux_webhook(request: Request):
    """Handle Mux Webhooks"""
    try:
        body = await request.json()
        type = body.get("type")
        data = body.get("data", {})
        
        print(f"Received Mux Webhook: {type}")

        if not supabase_service:
            print("Supabase service not available for webhook processing")
            return {"status": "service_unavailable"}

        if type == "video.upload.asset_created":
            upload_id = data.get("upload_id")
            asset_id = data.get("asset_id")
            if upload_id and asset_id:
                 print(f"Linking Upload {upload_id} to Asset {asset_id}")
                 await supabase_service.update_video_by_upload_id(upload_id, {
                     "mux_asset_id": asset_id,
                     "status": "processing"
                 })
                 
        elif type == "video.asset.ready":
            asset_id = data.get("id")
            playback_ids = data.get("playback_ids", [])
            playback_id = playback_ids[0].get("id") if playback_ids else None
            
            if asset_id:
                print(f"Asset {asset_id} is ready. Playback ID: {playback_id}")
                await supabase_service.update_video_by_asset_id(asset_id, {
                    "status": "ready",
                    "mux_playback_id": playback_id
                })

    except Exception as e:
        print(f"Webhook Error: {e}")
        return {"status": "error", "message": str(e)}

    return {"status": "ok"}
