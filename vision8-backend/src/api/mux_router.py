
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os 
from ..services.mux_service import MuxService
from ..services.comfy_mcp_service import comfy_service
from ..services.supabase_service import SupabaseService

router = APIRouter(prefix="/api/mux", tags=["mux"])

# Initialize services (assuming env vars are loaded)
mux_service = MuxService()
supabase_service = SupabaseService()

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
        return await mux_service.create_upload_url()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/assets")
async def list_assets():
    """List recent assets"""
    try:
         return await mux_service.list_assets()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/global")
async def get_global_analytics(timeframe: Optional[str] = "7:days"):
    """Get global analytics data from Mux (Data API)"""
    try:
        data = await mux_service.get_real_analytics([timeframe])
        if not data:
             # Return structure with 0 values if API fails or yields nothing
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
            # Logic to create a new asset by splicing clips
            # For MVP, maybe just return success mock
            return {"status": "processing", "message": "Scene removal started"}
        
        elif request.option in ["budget", "premium"]:
            if not request.prompt:
                raise HTTPException(status_code=400, detail="Prompt required for generation")
            
            # Trigger ComfyUI generation
            workflow_map = {
                "budget": "hallucination_scene", # Equivalent to SVD
                "premium": "hero_scene",       # Pro-Realism Hero
                "wan2.2": "hero_scene"          # Wan 2.2 generation
            }
            
            workflow_name = workflow_map.get(request.option, "hallucination_scene")
            
            # Execute workflow
            # In a real flow, you might chain these. For now, we trigger the one requested.
            # If "premium" is requested, we run hero_scene. 
            # Note: sequential chaining (hero -> lipsync) is handled by the agent orchestrator (gemini.ts)
            result_url = await comfy_service.run_workflow(workflow_name, {
                "USER_PROMPT": request.prompt,
                "SOURCE_VIDEO": None # Placeholder, would come from actual asset
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
