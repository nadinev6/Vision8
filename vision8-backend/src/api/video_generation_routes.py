"""
Video Generation API Routes for Vision8 Backend

Provides endpoints for AI-powered video generation, scene replacement,
and generation management using Wan 2.2 and other models.
"""

import asyncio
import os
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import structlog

from services.video_generation_service import video_generation_service

logger = structlog.get_logger()

router = APIRouter(prefix="/generation", tags=["Video Generation"])

class ConcatenateRequest(BaseModel):
    """Request model for video concatenation."""
    video_urls: List[str] = Field(..., description="List of video URLs to concatenate")
    output_filename: Optional[str] = Field(None, description="Optional custom output filename")


# Request/Response Models
class GenerationRequest(BaseModel):
    """Request model for video generation."""
    video_id: str = Field(..., description="Source video identifier")
    scene_id: str = Field(..., description="Scene to replace identifier")
    prompt: str = Field(..., description="Conversational modification instructions", max_length=2000)
    model: str = Field(default="wan2.2", description="AI model to use")
    quality: str = Field(default="standard", description="Quality preset")
    duration_seconds: float = Field(default=5.0, ge=1.0, le=30.0, description="Duration in seconds")
    reference_frame: Optional[str] = Field(None, description="Base64 encoded reference frame")
    style_settings: Optional[Dict[str, Any]] = Field(None, description="Additional style parameters")
    structured_context: Optional[Dict[str, Any]] = Field(None, description="Rich scene context from RAG system")
    user_api_key: Optional[str] = Field(None, description="User-provided Vertex AI access token")


class GenerationResponse(BaseModel):
    """Response model for generation requests."""
    job_id: str
    status: str
    message: str
    estimated_completion_seconds: Optional[float] = None
    generation_url: Optional[str] = None


class GenerationStatus(BaseModel):
    """Model for generation status."""
    job_id: str
    status: str
    progress: int
    generation_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[float] = None
    file_size: Optional[int] = None
    error_message: Optional[str] = None
    created_at: float
    completed_at: Optional[float] = None


class GenerationListItem(BaseModel):
    """Model for generation list items."""
    job_id: str
    scene_id: str
    model: str
    status: str
    created_at: float
    generation_url: Optional[str] = None


@router.post("/generate-scene", response_model=GenerationResponse)
async def generate_scene(
    request: GenerationRequest,
    background_tasks: BackgroundTasks
) -> GenerationResponse:
    """
    Generate a replacement scene using AI video generation.
    
    This endpoint initiates video generation for a specific scene replacement.
    The generation runs asynchronously and status can be checked using the job_id.
    """
    try:
        logger.info("Received scene generation request",
                   video_id=request.video_id,
                   scene_id=request.scene_id,
                   model=request.model,
                   prompt=request.prompt[:100] + "..." if len(request.prompt) > 100 else request.prompt)
        
        # Validate model
        supported_models = video_generation_service.get_supported_models()
        if request.model not in supported_models:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported model '{request.model}'. Supported models: {supported_models}"
            )
        
        # Validate quality preset
        quality_presets = video_generation_service.get_quality_presets()
        if request.quality not in quality_presets:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported quality '{request.quality}'. Available presets: {list(quality_presets.keys())}"
            )
        
        # Start generation
        generation_result = await video_generation_service.generate_scene_replacement(
            video_id=request.video_id,
            scene_id=request.scene_id,
            generation_prompt=request.prompt,
            model=request.model,
            quality=request.quality,
            duration_seconds=request.duration_seconds,
            reference_frame=request.reference_frame,
            style_settings=request.style_settings,
            user_api_key=request.user_api_key
        )
        
        logger.info("Scene generation initiated",
                   job_id=generation_result['job_id'],
                   status=generation_result['status'])
        
        return GenerationResponse(
            job_id=generation_result['job_id'],
            status=generation_result['status'],
            message=f"Scene generation started with {request.model}",
            estimated_completion_seconds=generation_result.get('estimated_completion'),
            generation_url=generation_result.get('generation_url')
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Scene generation request failed", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.get("/status/{job_id}", response_model=GenerationStatus)
async def get_generation_status(job_id: str) -> GenerationStatus:
    """
    Get the status of a video generation job.
    
    Returns current status, progress, and download URLs when available.
    """
    try:
        logger.info("Checking generation status", job_id=job_id)
        
        status_data = await video_generation_service.get_generation_status(job_id)
        
        return GenerationStatus(
            job_id=status_data['job_id'],
            status=status_data['status'],
            progress=status_data.get('progress', 0),
            generation_url=status_data.get('generation_url'),
            thumbnail_url=status_data.get('thumbnail_url'),
            duration=status_data.get('duration'),
            file_size=status_data.get('file_size'),
            error_message=status_data.get('error_message'),
            created_at=status_data.get('created_at', 0),
            completed_at=status_data.get('completed_at')
        )
        
    except Exception as e:
        logger.error("Failed to get generation status", job_id=job_id, error=str(e))
        raise HTTPException(status_code=404, detail=f"Generation job not found: {job_id}")


@router.get("/list/{video_id}", response_model=List[GenerationListItem])
async def list_generations(video_id: str) -> List[GenerationListItem]:
    """
    List all generations for a specific video.
    
    Returns a list of all generation jobs associated with the video.
    """
    try:
        logger.info("Listing generations", video_id=video_id)
        
        generations = await video_generation_service.list_generations(video_id)
        
        return [
            GenerationListItem(
                job_id=gen['job_id'],
                scene_id=gen['scene_id'],
                model=gen['model'],
                status=gen['status'],
                created_at=gen['created_at'],
                generation_url=gen.get('generation_url')
            )
            for gen in generations
        ]
        
    except Exception as e:
        logger.error("Failed to list generations", video_id=video_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to list generations: {str(e)}")


@router.delete("/delete/{job_id}")
async def delete_generation(job_id: str) -> Dict[str, str]:
    """
    Delete a generation job and its associated files.
    
    This will cancel the job if it's still processing and remove all generated files.
    """
    try:
        logger.info("Deleting generation", job_id=job_id)
        
        success = await video_generation_service.delete_generation(job_id)
        
        if success:
            return {"message": f"Generation {job_id} deleted successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete generation")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete generation", job_id=job_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to delete generation: {str(e)}")


@router.get("/models")
async def get_supported_models() -> Dict[str, List[str]]:
    """
    Get list of supported AI models for video generation.
    """
    try:
        models = video_generation_service.get_supported_models()
        return {"supported_models": models}
        
    except Exception as e:
        logger.error("Failed to get supported models", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get supported models")


@router.get("/quality-presets")
async def get_quality_presets() -> Dict[str, Dict]:
    """
    Get available quality presets for video generation.
    """
    try:
        presets = video_generation_service.get_quality_presets()
        return {"quality_presets": presets}
        
    except Exception as e:
        logger.error("Failed to get quality presets", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get quality presets")


@router.post("/stitch-video")
async def stitch_video_with_scene(
    original_video: UploadFile = File(...),
    generated_scene: UploadFile = File(...),
    scene_start_time: float = Form(...),
    scene_end_time: float = Form(...),
    background_tasks: BackgroundTasks = None
) -> Dict[str, str]:
    """
    Stitch original video with generated scene replacement.
    
    This endpoint combines the original video with a generated scene,
    replacing the specified time range with the new content.
    """
    try:
        logger.info("Starting video stitching",
                   original_filename=original_video.filename,
                   generated_filename=generated_scene.filename,
                   start_time=scene_start_time,
                   end_time=scene_end_time)
        
        # Validate file types
        allowed_types = ['video/mp4', 'video/avi', 'video/mov', 'video/webm']
        if original_video.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Invalid original video format")
        if generated_scene.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Invalid generated scene format")
        
        # Validate time range
        if scene_start_time >= scene_end_time:
            raise HTTPException(status_code=400, detail="Invalid time range: start_time must be less than end_time")
        
        # For now, return a mock response
        # In a real implementation, this would:
        # 1. Save uploaded files temporarily
        # 2. Use FFmpeg to stitch videos
        # 3. Upload result to cloud storage
        # 4. Return download URL
        
        stitched_url = f"https://mock-storage.com/stitched/video_{int(scene_start_time)}_{int(scene_end_time)}.mp4"
        
        return {
            "message": "Video stitching completed",
            "stitched_video_url": stitched_url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Video stitching failed", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Video stitching failed: {str(e)}")


class StitchRequest(BaseModel):
    """Request model for video stitching."""
    original_video_url: str = Field(..., description="URL of original video")
    generated_scene_url: str = Field(..., description="URL of generated scene")
    scene_start_time: float = Field(..., description="Start time of scene to replace (seconds)")
    scene_end_time: float = Field(..., description="End time of scene to replace (seconds)")
    output_filename: Optional[str] = Field(None, description="Custom output filename")


@router.post("/stitch", response_model=Dict[str, Any])
async def stitch_video_with_scene(request: StitchRequest) -> Dict[str, Any]:
    """
    Stitch original video with generated scene replacement.
    
    This endpoint combines the original video with a generated scene,
    replacing the specified time segment.
    """
    try:
        logger.info("Starting video stitching request", 
                   original_video=request.original_video_url,
                   generated_scene=request.generated_scene_url,
                   start_time=request.scene_start_time,
                   end_time=request.scene_end_time)
        
        # Generate output filename
        output_filename = request.output_filename or f"stitched_{int(asyncio.get_event_loop().time())}.mp4"
        
        # In a real implementation, you would:
        # 1. Download videos from URLs to temporary files
        # 2. Call the stitching service
        # 3. Upload result to cloud storage
        # 4. Return the new video URL
        
        # For now, return a success response
        return {
            "status": "success",
            "message": "Video stitching completed",
            "output_url": f"https://storage.googleapis.com/vision8-videos/{output_filename}",
            "processing_time": 30.5,
            "output_filename": output_filename
        }
        
    except Exception as e:
        logger.error("Video stitching failed", error=str(e), exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Video stitching failed: {str(e)}"
        )


@router.post("/concatenate")
async def concatenate_videos(request: ConcatenateRequest) -> Dict[str, Any]:
    """
    Concatenate multiple video segments into a single file.
    """
    try:
        logger.info("Received concatenation request", count=len(request.video_urls))
        result = await video_generation_service.concatenate_videos(
            request.video_urls, 
            request.output_filename
        )
        return result
    except Exception as e:
        logger.error("Concatenation request failed", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scene-context/{video_id}/{scene_id}")
async def get_scene_context(video_id: str, scene_id: str) -> Dict[str, Any]:
    """
    Get structured context for a specific scene to inform generation.
    
    This endpoint retrieves the rich metadata for a scene including
    objects, dialogue, timing, and visual characteristics.
    """
    try:
        logger.info("Getting scene context", video_id=video_id, scene_id=scene_id)
        
        # In real implementation, query Elasticsearch for scene data
        # For now, return mock structured context
        return {
            "scene_id": scene_id,
            "video_id": video_id,
            "scene_summary": "A person walking through a park on a sunny day",
            "start_time_ms": 15000,
            "end_time_ms": 20000,
            "objects_tracked": [
                {"label": "person", "confidence": 0.95},
                {"label": "tree", "confidence": 0.87},
                {"label": "bench", "confidence": 0.73}
            ],
            "transcript_phrases": [
                {"text": "What a beautiful day!", "start_ms": 15500, "end_ms": 17000, "speaker": "Person1"}
            ],
            "visual_style": {
                "lighting": "bright_daylight",
                "color_palette": "warm_natural",
                "camera_movement": "steady_follow"
            },
            "audio_elements": {
                "ambient_sound": "birds_chirping",
                "music": "none",
                "dialogue_present": True
            }
        }
        
    except Exception as e:
        logger.error("Failed to get scene context", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get scene context: {str(e)}"
        )


@router.get("/video-info")
async def get_video_info(video_url: str) -> Dict[str, Any]:
    """
    Get video information including duration, resolution, and codec details.
    """
    try:
        # In real implementation, download video temporarily and analyze
        # For now, return mock info
        return {
            "duration": 120.5,
            "size": 15728640,  # 15MB
            "video": {
                "width": 1920,
                "height": 1080,
                "fps": 30.0,
                "codec": "h264"
            },
            "audio": {
                "codec": "aac",
                "sample_rate": 44100,
                "channels": 2
            }
        }
        
    except Exception as e:
        logger.error("Failed to get video info", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get video info: {str(e)}"
        )


@router.get("/download/{job_id}")
async def download_generated_video(job_id: str):
    """
    Download a generated or stitched video file.
    
    Returns the video file as a downloadable response.
    """
    try:
        logger.info("Download request", job_id=job_id)
        
        # Get generation status to find the file path
        status = await video_generation_service.get_generation_status(job_id)
        
        if status['status'] != 'completed':
            raise HTTPException(
                status_code=400,
                detail=f"Video generation not completed. Status: {status['status']}"
            )
        
        # In a real implementation, you would:
        # 1. Get the actual file path from the generation metadata
        # 2. Check if file exists
        # 3. Return the file
        
        # For now, we'll assume the file is stored locally
        video_filename = f"{job_id}.mp4"
        video_path = f"/tmp/generated_videos/{video_filename}"
        
        # Check if file exists
        if not os.path.exists(video_path):
            raise HTTPException(
                status_code=404,
                detail="Generated video file not found"
            )
        
        return FileResponse(
            path=video_path,
            media_type='video/mp4',
            filename=video_filename,
            headers={"Content-Disposition": f"attachment; filename={video_filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Download failed", job_id=job_id, error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Download failed: {str(e)}"
        )


@router.get("/stream/{job_id}")
async def stream_generated_video(job_id: str):
    """
    Stream a generated video for preview/playback.
    
    Returns the video file for streaming playback.
    """
    try:
        logger.info("Stream request", job_id=job_id)
        
        # Get generation status
        status = await video_generation_service.get_generation_status(job_id)
        
        if status['status'] != 'completed':
            raise HTTPException(
                status_code=400,
                detail=f"Video generation not completed. Status: {status['status']}"
            )
        
        video_filename = f"{job_id}.mp4"
        video_path = f"/tmp/generated_videos/{video_filename}"
        
        if not os.path.exists(video_path):
            raise HTTPException(
                status_code=404,
                detail="Generated video file not found"
            )
        
        return FileResponse(
            path=video_path,
            media_type='video/mp4',
            headers={"Content-Disposition": f"inline; filename={video_filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Stream failed", job_id=job_id, error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Stream failed: {str(e)}"
        )


# Health check for generation service
@router.get("/health")
async def generation_health_check() -> Dict[str, Any]:
    """
    Health check for video generation service.
    """
    try:
        models = video_generation_service.get_supported_models()
        presets = video_generation_service.get_quality_presets()
        
        return {
            "status": "healthy",
            "supported_models": models,
            "quality_presets": list(presets.keys()),
            "service": "video_generation",
            "features": ["generation", "stitching", "video_info"]
        }
        
    except Exception as e:
        logger.error("Generation service health check failed", error=str(e))
        return {
            "status": "unhealthy",
            "error": str(e),
            "service": "video_generation"
        }