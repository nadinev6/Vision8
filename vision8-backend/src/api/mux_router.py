from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os 

# Try to import services with fallback for missing dependencies
try:
    from services.mux_service import MuxService
except ImportError:
    MuxService = None
    
try:
    from services.comfy_mcp_service import comfy_service
except ImportError:
    comfy_service = None
    
try:
    from services.supabase_service import SupabaseService
except ImportError:
    SupabaseService = None

router = APIRouter(prefix="/mux", tags=["mux"])

# Initialize services with error handling
mux_service = MuxService() if MuxService else None
supabase_service = SupabaseService() if SupabaseService else None

class SceneReplacementRequest(BaseModel):
    asset_id: str
    start_time: float
    end_time: float
    option: str # "remove", "budget", "premium", "wan2.2"
    prompt: Optional[str] = None

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
