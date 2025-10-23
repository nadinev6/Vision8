"""
Audio Transcription API Routes

This module provides REST API endpoints for audio transcription functionality:
- Video transcription job creation
- Job status tracking
- Result retrieval
- Service health monitoring

Implements requirements 4.1, 4.2, 4.3, and 4.4 for API integration.
"""

import logging
import os
from typing import Dict, Any, Optional
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services.audio import (
    AudioTranscriptionService,
    TranscriptionResult,
    TranscriptionJob,
    TranscriptionError,
    TranscriptionStatus
)

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/v1/audio", tags=["audio-transcription"])

# Global service instance
_transcription_service: Optional[AudioTranscriptionService] = None


def get_transcription_service() -> AudioTranscriptionService:
    """
    Get or create the audio transcription service instance
    
    Returns:
        AudioTranscriptionService instance
    """
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = AudioTranscriptionService()
    return _transcription_service


# Request/Response Models
class TranscriptionRequest(BaseModel):
    """Request model for video transcription"""
    video_id: str = Field(..., description="Unique identifier for the video")
    language: str = Field(default="en-US", description="Target language for transcription")
    engine: Optional[str] = Field(None, description="Preferred speech recognition engine")


class TranscriptionJobResponse(BaseModel):
    """Response model for transcription job creation"""
    job_id: str = Field(..., description="Unique job identifier for tracking")
    video_id: str = Field(..., description="Video identifier")
    status: str = Field(..., description="Current job status")
    message: str = Field(..., description="Human-readable status message")


class TranscriptionStatusResponse(BaseModel):
    """Response model for job status"""
    job_id: str = Field(..., description="Job identifier")
    video_id: str = Field(..., description="Video identifier")
    status: str = Field(..., description="Current job status")
    progress: float = Field(..., description="Progress percentage (0-100)")
    created_at: str = Field(..., description="Job creation timestamp")
    started_at: Optional[str] = Field(None, description="Processing start timestamp")
    completed_at: Optional[str] = Field(None, description="Completion timestamp")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    processing_time: Optional[float] = Field(None, description="Total processing time in seconds")


class ServiceStatsResponse(BaseModel):
    """Response model for service statistics"""
    total_jobs: int = Field(..., description="Total number of jobs processed")
    completed_jobs: int = Field(..., description="Number of completed jobs")
    failed_jobs: int = Field(..., description="Number of failed jobs")
    active_jobs: int = Field(..., description="Number of currently active jobs")
    success_rate: float = Field(..., description="Success rate percentage")
    service_uptime: str = Field(..., description="Service uptime information")


# API Endpoints

@router.post("/transcribe", response_model=TranscriptionJobResponse)
async def create_transcription_job(
    file: UploadFile = File(..., description="Video file to transcribe"),
    video_id: Optional[str] = None,
    language: str = "en-US",
    engine: Optional[str] = None,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    service: AudioTranscriptionService = Depends(get_transcription_service)
):
    """
    Create a new video transcription job
    
    Accepts video file uploads and starts transcription processing.
    Returns job ID for status tracking.
    
    - **file**: Video file (MP4, AVI, MOV, etc.) up to 200MB
    - **video_id**: Optional unique identifier (generated if not provided)
    - **language**: Target language code (e.g., en-US, es-ES, fr-FR)
    - **engine**: Preferred speech recognition engine (google, whisper)
    
    Returns job information for tracking transcription progress.
    """
    try:
        # Validate file size (200MB limit)
        max_size = 200 * 1024 * 1024  # 200MB in bytes
        if file.size and file.size > max_size:
            raise HTTPException(
                status_code=413,
                detail=f"File size ({file.size / 1024 / 1024:.1f}MB) exceeds maximum allowed size (200MB)"
            )
        
        # Validate file type
        allowed_extensions = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv'}
        file_extension = Path(file.filename or "").suffix.lower()
        if file_extension not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file_extension}. Allowed types: {', '.join(allowed_extensions)}"
            )
        
        # Generate video ID if not provided
        if not video_id:
            video_id = Path(file.filename or "unknown").stem
        
        # Save uploaded file temporarily
        temp_dir = Path("/tmp/vision8_uploads")
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        temp_file_path = temp_dir / f"{video_id}_{file.filename}"
        
        with open(temp_file_path, "wb") as temp_file:
            content = await file.read()
            temp_file.write(content)
        
        # Start transcription job
        job_id = await service.transcribe_video(
            video_path=str(temp_file_path),
            video_id=video_id,
            language=language,
            engine=engine
        )
        
        # Schedule cleanup of temp file after processing
        background_tasks.add_task(_cleanup_temp_file, str(temp_file_path))
        
        logger.info(f"Created transcription job {job_id} for video {video_id}")
        
        return TranscriptionJobResponse(
            job_id=job_id,
            video_id=video_id,
            status="pending",
            message=f"Transcription job created successfully. Use job ID {job_id} to track progress."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create transcription job: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create transcription job: {str(e)}"
        )


@router.get("/status/{job_id}", response_model=TranscriptionStatusResponse)
async def get_transcription_status(
    job_id: str,
    service: AudioTranscriptionService = Depends(get_transcription_service)
):
    """
    Get current status of a transcription job
    
    Returns detailed information about job progress, timing, and any errors.
    
    - **job_id**: Unique job identifier returned from transcription creation
    
    Returns current job status and progress information.
    """
    try:
        job = await service.get_transcription_status(job_id)
        
        return TranscriptionStatusResponse(
            job_id=job.job_id,
            video_id=job.video_id,
            status=job.status.value,
            progress=job.progress,
            created_at=job.created_at.isoformat(),
            started_at=job.started_at.isoformat() if job.started_at else None,
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
            error_message=job.error_message,
            processing_time=job.processing_duration
        )
        
    except TranscriptionError as e:
        if e.error_code == "JOB_NOT_FOUND":
            raise HTTPException(status_code=404, detail=e.error_message)
        else:
            raise HTTPException(status_code=400, detail=e.error_message)
    except Exception as e:
        logger.error(f"Failed to get job status for {job_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get job status: {str(e)}"
        )


@router.get("/results/{job_id}")
async def get_transcription_result(
    job_id: str,
    format: str = "json",
    service: AudioTranscriptionService = Depends(get_transcription_service)
):
    """
    Get transcription result for a completed job
    
    Returns the complete transcription with segments, timestamps, and metadata.
    
    - **job_id**: Unique job identifier
    - **format**: Response format (json, elasticsearch)
    
    Returns complete transcription result with timing and confidence information.
    """
    try:
        result = await service.get_transcription_result(job_id)
        
        if format.lower() == "elasticsearch":
            # Return Elasticsearch-formatted document
            es_doc = service.transcription_processor.format_for_elasticsearch(result)
            return JSONResponse(content=es_doc)
        else:
            # Return standard JSON format
            return JSONResponse(content=result.dict())
        
    except TranscriptionError as e:
        if e.error_code == "JOB_NOT_FOUND":
            raise HTTPException(status_code=404, detail=e.error_message)
        elif e.error_code == "JOB_NOT_COMPLETED":
            raise HTTPException(status_code=202, detail=e.error_message)
        else:
            raise HTTPException(status_code=400, detail=e.error_message)
    except Exception as e:
        logger.error(f"Failed to get transcription result for {job_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get transcription result: {str(e)}"
        )


@router.delete("/jobs/{job_id}")
async def cancel_transcription_job(
    job_id: str,
    service: AudioTranscriptionService = Depends(get_transcription_service)
):
    """
    Cancel an active transcription job
    
    Stops processing and cleans up resources for the specified job.
    
    - **job_id**: Unique job identifier to cancel
    
    Returns success status of the cancellation operation.
    """
    try:
        success = await service.cancel_transcription_job(job_id)
        
        if success:
            return {"message": f"Transcription job {job_id} cancelled successfully"}
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Job {job_id} not found or already completed"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel job {job_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to cancel job: {str(e)}"
        )


@router.get("/stats", response_model=ServiceStatsResponse)
async def get_service_statistics(
    service: AudioTranscriptionService = Depends(get_transcription_service)
):
    """
    Get audio transcription service statistics
    
    Returns performance metrics, job counts, and service health information.
    
    Useful for monitoring service performance and capacity planning.
    """
    try:
        stats = await service.get_service_stats()
        
        return ServiceStatsResponse(
            total_jobs=stats["total_jobs"],
            completed_jobs=stats["completed_jobs"],
            failed_jobs=stats["failed_jobs"],
            active_jobs=stats["active_jobs"],
            success_rate=stats["success_rate"],
            service_uptime=stats["service_uptime"]
        )
        
    except Exception as e:
        logger.error(f"Failed to get service statistics: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get service statistics: {str(e)}"
        )


@router.get("/health")
async def health_check(
    service: AudioTranscriptionService = Depends(get_transcription_service)
):
    """
    Health check endpoint for service monitoring
    
    Returns basic service health and availability information.
    """
    try:
        stats = await service.get_service_stats()
        
        return {
            "status": "healthy",
            "service": "audio-transcription",
            "version": "1.0.0",
            "active_jobs": stats["active_jobs"],
            "total_processed": stats["total_jobs"],
            "timestamp": stats["service_uptime"]
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "service": "audio-transcription",
                "error": str(e)
            }
        )


# Utility Functions

async def _cleanup_temp_file(file_path: str):
    """
    Clean up temporary uploaded file
    
    Args:
        file_path: Path to temporary file to remove
    """
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.debug(f"Cleaned up temporary file: {file_path}")
    except Exception as e:
        logger.warning(f"Failed to clean up temporary file {file_path}: {e}")


# Note: Exception handlers are configured at the application level in main.py