"""
Image Generation API Routes for Vision8 Backend

Provides endpoints for AI-powered image generation and image management.
"""

import asyncio
import os
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import structlog

from services.image_generation_service import image_generation_service

logger = structlog.get_logger()

router = APIRouter(prefix="/image-generation", tags=["Image Generation"])


# Request/Response Models
class ImageGenerationRequest(BaseModel):
    """Request model for image generation."""
    image_id: str = Field(..., description="Unique image generation identifier")
    prompt: str = Field(..., description="Text prompt for image generation", max_length=1000)
    model: str = Field(default="imagen3", description="AI model to use")
    quality: str = Field(default="standard", description="Quality preset")
    style_settings: Optional[Dict[str, Any]] = Field(None, description="Additional style parameters")
    reference_image: Optional[str] = Field(None, description="Base64 encoded reference image")
    user_api_key: Optional[str] = Field(None, description="User-provided API access token")


class ImageGenerationResponse(BaseModel):
    """Response model for image generation requests."""
    job_id: str
    status: str
    message: str
    estimated_completion_seconds: Optional[float] = None
    generation_url: Optional[str] = None


class ImageGenerationStatus(BaseModel):
    """Model for image generation status."""
    job_id: str
    status: str
    progress: int
    generation_url: Optional[str] = None
    file_size: Optional[int] = None
    error_message: Optional[str] = None
    created_at: float
    completed_at: Optional[float] = None


@router.post("/generate", response_model=ImageGenerationResponse)
async def generate_image(
    request: ImageGenerationRequest,
    background_tasks: BackgroundTasks
) -> ImageGenerationResponse:
    """
    Generate an image using AI image generation.
    
    This endpoint initiates image generation asynchronously.
    Status can be checked using the job_id.
    """
    try:
        logger.info("Received image generation request",
                   image_id=request.image_id,
                   model=request.model,
                   prompt=request.prompt[:100] + "..." if len(request.prompt) > 100 else request.prompt)
        
        # Validate model
        supported_models = image_generation_service.get_supported_models()
        if request.model not in supported_models:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported model '{request.model}'. Supported models: {supported_models}"
            )
        
        # Validate quality
        quality_presets = image_generation_service.get_quality_presets()
        if request.quality not in quality_presets:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported quality '{request.quality}'. Supported: {list(quality_presets.keys())}"
            )
        
        # Initiate generation
        generation_result = await image_generation_service.generate_image(
            image_id=request.image_id,
            generation_prompt=request.prompt,
            model=request.model,
            quality=request.quality,
            style_settings=request.style_settings,
            reference_image=request.reference_image,
            user_api_key=request.user_api_key
        )
        
        # Calculate estimated completion time
        estimated_seconds = None
        if generation_result.get('estimated_completion'):
            estimated_seconds = generation_result['estimated_completion'] - asyncio.get_event_loop().time()
        
        return ImageGenerationResponse(
            job_id=generation_result['job_id'],
            status=generation_result['status'],
            message=f"Image generation {generation_result['status']}",
            estimated_completion_seconds=estimated_seconds,
            generation_url=generation_result.get('generation_url')
        )
        
    except ValueError as e:
        logger.warning("Image generation validation error",
                      image_id=request.image_id,
                      error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Image generation failed",
                    image_id=request.image_id,
                    error=str(e),
                    exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Image generation failed: {str(e)}"
        )


@router.get("/status/{job_id}", response_model=ImageGenerationStatus)
async def get_generation_status(job_id: str) -> ImageGenerationStatus:
    """
    Get the status of an image generation job.
    
    Args:
        job_id: The generation job ID
        
    Returns:
        Current generation status and metadata
    """
    try:
        logger.info("Checking image generation status",
                   job_id=job_id)
        
        status = await image_generation_service.get_image_status(job_id)
        
        return ImageGenerationStatus(
            job_id=status['job_id'],
            status=status['status'],
            progress=status.get('progress', 0),
            generation_url=status.get('generation_url'),
            error_message=status.get('error_message'),
            created_at=status.get('created_at', asyncio.get_event_loop().time()),
            completed_at=status.get('completed_at')
        )
        
    except Exception as e:
        logger.error("Failed to get generation status",
                    job_id=job_id,
                    error=str(e),
                    exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get generation status: {str(e)}"
        )


@router.post("/upload-reference")
async def upload_reference_image(
    file: UploadFile = File(...),
    image_type: str = Form(default="reference")
) -> Dict[str, Any]:
    """
    Upload a reference image for image generation.
    
    Supports JPG, PNG, and WebP images up to 10MB.
    
    Args:
        file: Image file to upload
        image_type: Type of image ('reference', 'environment', 'style')
        
    Returns:
        Image metadata and storage information
    """
    try:
        # Validate file type
        valid_types = ['image/jpeg', 'image/png', 'image/webp']
        if file.content_type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Supported: {valid_types}"
            )
        
        # Read file content
        content = await file.read()
        
        logger.info("Received image upload",
                   filename=file.filename,
                   size=len(content),
                   image_type=image_type)
        
        # Handle upload
        image_metadata = await image_generation_service.handle_image_upload(
            file_content=content,
            file_name=file.filename or "unnamed_image",
            image_type=image_type
        )
        
        return {
            "status": "success",
            "message": "Image uploaded successfully",
            "image_id": image_metadata['image_id'],
            "storage_path": image_metadata['storage_path'],
            "base64": image_metadata.get('base64_encoded')
        }
        
    except ValueError as e:
        logger.warning("Image upload validation error",
                      filename=file.filename,
                      error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Image upload failed",
                    filename=file.filename,
                    error=str(e),
                    exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Image upload failed: {str(e)}"
        )


@router.get("/models")
async def get_supported_models() -> Dict[str, Any]:
    """
    Get list of supported image generation models and quality presets.
    
    Returns:
        Available models and their quality options
    """
    try:
        models = image_generation_service.get_supported_models()
        quality_presets = image_generation_service.get_quality_presets()
        
        return {
            "status": "success",
            "models": models,
            "quality_presets": quality_presets,
            "default_model": "imagen3",
            "default_quality": "standard"
        }
        
    except Exception as e:
        logger.error("Failed to get models",
                    error=str(e),
                    exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get models: {str(e)}"
        )
