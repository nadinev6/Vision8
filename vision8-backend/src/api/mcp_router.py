"""
MCP Router for Vision8 Backend

Exposes the MCP server functionality via REST API endpoints,
allowing the frontend/agent to discover and execute MCP tools.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Dict, Any, List, Optional
import structlog

from services.mcp_server import mcp_server

logger = structlog.get_logger()

router = APIRouter(tags=["MCP"])


# =========================================================================
# Request/Response Models
# =========================================================================
class ToolExecutionRequest(BaseModel):
    """Request model for executing an MCP tool."""
    tool_name: str
    parameters: Dict[str, Any] = {}

    # Allow for flexible payload formats
    model_config = ConfigDict(extra="allow")


class ToolExecutionResponse(BaseModel):
    """Response model for tool execution."""
    status: str
    result: Dict[str, Any]
    tool_name: str


class GeneratePlateRequest(BaseModel):
    """Request model for the generatePlate tool."""
    prompt: str
    duration_seconds: float = 5.0
    resolution: str = "720p"
    seed: Optional[int] = None
    environment_lock_image: Optional[str] = None


class UpscaleRequest(BaseModel):
    """Request model for the upscaleExisting tool."""
    source_video: Optional[str] = None
    denoise_strength: float = 0.35
    target_resolution: str = "4k"


class StitchRequest(BaseModel):
    """Request model for the stitchVideos tool."""
    video_segments: List[str]
    output_filename: Optional[str] = None


# =========================================================================
# Tool Discovery Endpoints
# =========================================================================
@router.get("/tools")
async def get_available_tools() -> Dict[str, Any]:
    """
    Discover all available MCP tools.
    
    Returns a list of tools the agent can use, including:
    - Core tools (generatePlate, upscaleExisting, etc.)
    - Discovered workflows from the workflows directory
    """
    try:
        tools = mcp_server.get_available_tools()
        workflows = mcp_server.discovered_workflows
        
        return {
            "status": "success",
            "tools": tools,
            "workflows_discovered": len(workflows),
            "tool_count": len(tools)
        }
    except Exception as e:
        logger.error("Failed to get available tools", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workflows")
async def get_discovered_workflows() -> Dict[str, Any]:
    """
    List all discovered ComfyUI workflows.
    """
    try:
        workflows = mcp_server.discovered_workflows
        return {
            "status": "success",
            "workflows": workflows,
            "count": len(workflows)
        }
    except Exception as e:
        logger.error("Failed to get workflows", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================================
# Generic Tool Execution
# =========================================================================
@router.post("/execute")
async def execute_tool(request: ToolExecutionRequest) -> ToolExecutionResponse:
    """
    Execute any MCP tool by name.
    
    This is the main entry point for the agent to call tools.
    The server maintains stateful context across calls.
    """
    try:
        logger.info("MCP tool execution request", 
                   tool=request.tool_name,
                   params=list(request.parameters.keys()))
        
        result = await mcp_server.execute_tool(request.tool_name, request.parameters)
        
        return ToolExecutionResponse(
            status=result.get("status", "unknown"),
            result=result,
            tool_name=request.tool_name
        )
    except Exception as e:
        logger.error("Tool execution failed", 
                    tool=request.tool_name, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================================
# Convenience Endpoints (Type-Safe Wrappers)
# =========================================================================
@router.post("/generate-plate")
async def generate_plate(request: GeneratePlateRequest) -> Dict[str, Any]:
    """
    Generate a video plate using Wan 2.2.
    
    Creates a 5-8s video with optional environment lock for consistency.
    """
    try:
        result = await mcp_server.execute_tool("generatePlate", {
            "prompt": request.prompt,
            "duration_seconds": request.duration_seconds,
            "resolution": request.resolution,
            "seed": request.seed,
            "environment_lock_image": request.environment_lock_image
        })
        return result
    except Exception as e:
        logger.error("Generate plate failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upscale")
async def upscale_video(request: UpscaleRequest) -> Dict[str, Any]:
    """
    Upscale a video to 4K with denoise pass.
    
    If no source_video is provided, uses the last rendered plate.
    """
    try:
        result = await mcp_server.execute_tool("upscaleExisting", {
            "source_video": request.source_video,
            "denoise_strength": request.denoise_strength,
            "target_resolution": request.target_resolution
        })
        return result
    except Exception as e:
        logger.error("Upscale failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stitch")
async def stitch_videos(request: StitchRequest) -> Dict[str, Any]:
    """
    Stitch multiple video segments using FFmpeg.
    """
    try:
        result = await mcp_server.execute_tool("stitchVideos", {
            "video_segments": request.video_segments,
            "output_filename": request.output_filename
        })
        return result
    except Exception as e:
        logger.error("Stitch failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/credits")
async def check_credits() -> Dict[str, Any]:
    """
    Check remaining ComfyUI Cloud credits.
    """
    try:
        result = await mcp_server.execute_tool("checkCredits", {})
        return result
    except Exception as e:
        logger.error("Credits check failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================================
# Session Management
# =========================================================================
@router.get("/session")
async def get_session_context() -> Dict[str, Any]:
    """
    Get the current session state.
    
    Returns context about previous renders, seeds, and environment lock.
    """
    try:
        result = await mcp_server.execute_tool("getSessionContext", {})
        return result
    except Exception as e:
        logger.error("Get session failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/session/reset")
async def reset_session() -> Dict[str, Any]:
    """
    Reset the session for a new production.
    
    Clears render history, resets seed, and removes environment lock.
    """
    try:
        result = mcp_server.reset_session()
        return result
    except Exception as e:
        logger.error("Session reset failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/summary")
async def get_production_summary() -> Dict[str, Any]:
    """
    Get a summary of the current production session.
    
    Returns counts of renders, credits used, and current state.
    """
    try:
        result = mcp_server.get_production_summary()
        return result
    except Exception as e:
        logger.error("Get summary failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/environment-lock")
async def set_environment_lock(image_path: str) -> Dict[str, Any]:
    """
    Set the IP-Adapter image for environment consistency.
    
    All subsequent generatePlate calls will use this image for style lock.
    """
    try:
        result = await mcp_server.execute_tool("setEnvironmentLock", {
            "image_path": image_path
        })
        return result
    except Exception as e:
        logger.error("Set environment lock failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================================
# Health Check
# =========================================================================
@router.get("/health")
async def mcp_health() -> Dict[str, Any]:
    """
    Health check for MCP server.
    """
    try:
        tools = mcp_server.get_available_tools()
        workflows = mcp_server.discovered_workflows
        summary = mcp_server.get_production_summary()
        
        return {
            "status": "healthy",
            "service": "mcp_server",
            "tools_available": len(tools),
            "workflows_discovered": len(workflows),
            "session_renders": summary.get("total_renders", 0),
            "credits_remaining": summary.get("credits_remaining", 0)
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "mcp_server",
            "error": str(e)
        }
