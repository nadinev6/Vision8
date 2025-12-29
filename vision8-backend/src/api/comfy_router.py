
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
from services.comfy_mcp_service import comfy_service

router = APIRouter(prefix="/api/comfy", tags=["comfy"])

class WorkflowRequest(BaseModel):
    workflow_name: str
    inputs: Dict[str, Any]

@router.post("/run")
async def run_workflow(request: WorkflowRequest):
    """Run a specific ComfyUI workflow."""
    try:
        result_url = await comfy_service.run_workflow(request.workflow_name, request.inputs)
        return {
            "status": "completed",
            "result_url": result_url,
            "workflow": request.workflow_name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chain/pro-realism")
async def run_pro_realism_chain(request: Dict[str, Any]):
    """
    Chain hero_scene and lipsync workflows.
    Input: { "prompt": "...", "source_video": "..." }
    """
    try:
        prompt = request.get("prompt")
        source_video = request.get("source_video")
        
        if not prompt:
            raise HTTPException(status_code=400, detail="Prompt is required")
            
        # 1. Run Hero Scene
        hero_url = await comfy_service.run_workflow("hero_scene", {
            "USER_PROMPT": prompt,
            "SOURCE_VIDEO": source_video
        })
        
        # 2. Run LipSync using Hero Result
        final_url = await comfy_service.run_workflow("lipsync", {
            "SOURCE_VIDEO": hero_url,
            "LIP_REFERENCE": source_video
        })
        
        return {
            "status": "completed",
            "hero_url": hero_url,
            "final_url": final_url,
            "message": "Pro-Realism chain completed successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
