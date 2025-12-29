"""
Video Analysis API Routes

This module provides endpoints for uploading videos, analyzing content,
and searching through indexed video data.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Request
from typing import Dict, Any, List, Optional
import structlog
import asyncio
import json
import os
import uuid
import requests
import uuid
import requests
import tempfile
from datetime import datetime
from pydantic import BaseModel

from services.supabase_service import SupabaseService
from services.metadata_generator import MetadataGenerator
from services.audio.audio_transcription_service import AudioTranscriptionService
from services.mux_service import MuxService

logger = structlog.get_logger()

router = APIRouter(prefix="/analysis", tags=["Video Analysis"])

# Initialize services with better error handling
supabase_service = None
metadata_generator = None
audio_transcription_service = None
mux_service = None

def initialize_services():
    """Initialize services on demand"""
    global supabase_service, metadata_generator, audio_transcription_service, mux_service

    if supabase_service is None:
        try:
            logger.info("Initializing SupabaseService...")
            supabase_service = SupabaseService()
            logger.info("SupabaseService initialized successfully")
        except Exception as e:
            logger.warning("SupabaseService initialization failed - continuing without video search", error=str(e))
            supabase_service = None  # Continue without Supabase

    if metadata_generator is None:
        try:
            logger.info("Initializing MetadataGenerator...")
            metadata_generator = MetadataGenerator()
            logger.info("MetadataGenerator initialized successfully")
        except Exception as e:
            logger.error("MetadataGenerator initialization failed", error=str(e))
            metadata_generator = None

    if audio_transcription_service is None:
        try:
            logger.info("Initializing AudioTranscriptionService...")
            audio_transcription_service = AudioTranscriptionService()
            logger.info("AudioTranscriptionService initialized successfully")
        except Exception as e:
            logger.error("AudioTranscriptionService initialization failed", error=str(e))
            audio_transcription_service = None

    if mux_service is None:
        try:
            logger.info("Initializing MuxService...")
            mux_service = MuxService()
            logger.info("MuxService initialized successfully")
        except Exception as e:
            logger.error("MuxService initialization failed", error=str(e))
            mux_service = None

    return metadata_generator is not None

class AnalyzeMuxAssetRequest(BaseModel):
    mux_asset_id: str
    video_name: Optional[str] = None
    include_transcription: bool = False
    language: str = "en-US"


@router.post("/upload")
async def analyze_video(
    file: UploadFile = File(...),
    video_id: Optional[str] = Form(None),
    video_name: Optional[str] = Form(None),
    include_transcription: bool = Form(False),
    language: str = Form("en-US")
) -> Dict[str, Any]:
    """
    Upload and analyze a video file with optional audio transcription.
    
    5. Indexes the data in Supabase with vector embeddings.
    
    Args:
        file: The video file to analyze
        video_id: Optional custom video ID (if provided, should be a UUID)
        video_name: Optional user-entered name for the video/thread
        include_transcription: Whether to include accurate audio transcription
        language: Language code for transcription (e.g., en-US, es-ES)
        
    Returns:
        Analysis results, transcription status, and indexing information
    """
    # Initialize services on demand
    initialize_services()
    
    # Check if at least metadata generator is available
    if not metadata_generator:
        raise HTTPException(
            status_code=503, 
            detail="Metadata generator not available. Check Gemini API configuration."
        )
    
    try:
        # Generate proper UUID for database, preserve user name as thread name
        if not video_id or video_id == "Prose":  # Handle the "Prose" case and empty video_id
            # Generate a proper UUID for the database
            db_video_id = str(uuid.uuid4())
            # Use user-provided name as thread name, fallback to filename
            thread_name = video_name or file.filename or f"video_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            logger.info("Generated UUID for video_id", 
                       original_video_id=video_id, 
                       db_video_id=db_video_id, 
                       thread_name=thread_name)
        else:
            # If video_id is provided and not "Prose", validate and use it
            try:
                # Validate it's a proper UUID
                uuid.UUID(video_id)
                db_video_id = video_id
                thread_name = video_name or video_id
                logger.info("Using provided UUID", video_id=video_id, thread_name=thread_name)
            except (ValueError, TypeError):
                # If not a valid UUID, generate one and use provided as thread name
                db_video_id = str(uuid.uuid4())
                thread_name = video_name or video_id
                logger.info("Generated UUID for invalid video_id", 
                           original_video_id=video_id, 
                           db_video_id=db_video_id, 
                           thread_name=thread_name)
            else:
                # Valid UUID provided
                thread_name = video_name or video_id
        
        # Use the UUID as the video_id for database operations
        video_id = db_video_id
        
        logger.info("video_analysis_started", 
                   video_id=video_id, 
                   filename=file.filename,
                   content_type=file.content_type)
        
        # Save uploaded file temporarily - Use cross-platform temp directory
        temp_dir = tempfile.gettempdir()
        temp_file_path = os.path.join(temp_dir, f"{video_id}_{file.filename}")
        
        with open(temp_file_path, "wb") as temp_file:
            content = await file.read()
            temp_file.write(content)
        
        # Generate audio transcription if requested
        transcription_result = None
        transcription_job_id = None
        
        if include_transcription and audio_transcription_service:
            try:
                logger.info("starting_audio_transcription", video_id=video_id)
                transcription_job_id = await audio_transcription_service.transcribe_video(
                    video_path=temp_file_path,
                    video_id=video_id,
                    language=language
                )
                
                # Wait for transcription to complete (with timeout)
                max_wait_time = 300  # 5 minutes
                wait_time = 0
                poll_interval = 5  # 5 seconds
                
                while wait_time < max_wait_time:
                    try:
                        job_status = await audio_transcription_service.get_transcription_status(transcription_job_id)
                        
                        if job_status.status == "completed":
                            transcription_result = await audio_transcription_service.get_transcription_result(transcription_job_id)
                            logger.info("transcription_completed", 
                                       video_id=video_id, 
                                       segments=len(transcription_result.segments),
                                       confidence=transcription_result.confidence)
                            break
                        elif job_status.status == "failed":
                            logger.error("transcription_failed", 
                                        video_id=video_id, 
                                        error=job_status.error_message)
                            break
                        
                        await asyncio.sleep(poll_interval)
                        wait_time += poll_interval
                        
                    except Exception as status_error:
                        logger.warning("transcription_status_check_failed", 
                                      video_id=video_id, 
                                      error=str(status_error))
                        break
                
                if transcription_result is None:
                    logger.warning("transcription_timeout_or_failed", 
                                  video_id=video_id, 
                                  job_id=transcription_job_id)
                    
            except Exception as transcription_error:
                logger.error("transcription_service_failed", 
                            video_id=video_id, 
                            error=str(transcription_error))
                # Continue with video analysis even if transcription fails
        
        # Generate metadata using the metadata generator
        logger.info("generating_metadata", video_id=video_id, file_path=temp_file_path)
        
        try:
            metadata_result = await metadata_generator.generate_metadata(
                video_path=temp_file_path,
                video_id=video_id
            )
            
            # Enhance metadata with transcription if available
            if transcription_result:
                # Add transcription data to metadata
                metadata_result["accurate_transcript"] = {
                    "job_id": transcription_job_id,
                    "confidence": transcription_result.confidence,
                    "confidence_level": transcription_result.confidence_level.value if transcription_result.confidence_level else "unknown",
                    "segments": [
                        {
                            "text": segment.text,
                            "start_time_ms": segment.start_time_ms,
                            "end_time_ms": segment.end_time_ms,
                            "confidence": segment.confidence,
                            "speaker_id": segment.speaker_id
                        }
                        for segment in transcription_result.segments
                    ],
                    "full_transcript": transcription_result.full_transcript,
                    "word_count": transcription_result.word_count,
                    "processing_time": transcription_result.processing_time
                }
            
            logger.info("metadata_generated_successfully", 
                       video_id=video_id, 
                       has_scenes=bool(metadata_result.get("scenes")),
                       scene_count=len(metadata_result.get("scenes", [])),
                       has_transcript=bool(metadata_result.get("transcript")),
                       has_accurate_transcript=bool(transcription_result))
        except Exception as metadata_error:
            logger.error("metadata_generation_failed", 
                        video_id=video_id, 
                        error=str(metadata_error),
                        error_type=type(metadata_error).__name__)
            raise
        
        # Process and index the metadata - ALWAYS create documents
        documents = []
        
        if metadata_result and "scenes" in metadata_result and len(metadata_result["scenes"]) > 0:
            logger.info("indexing_scenes", 
                       video_id=video_id, 
                       scene_count=len(metadata_result["scenes"]))
            
            # Prepare documents for bulk indexing
            accurate_transcript = metadata_result.get("accurate_transcript", {})
            
            for scene in metadata_result["scenes"]:
                doc = {
                    "video_id": video_id,
                    "scene_id": f"{video_id}_scene_{scene.get('scene_number', len(documents) + 1)}",
                    "start_time_ms": scene.get("start_time_ms", 0),
                    "end_time_ms": scene.get("end_time_ms", 5000),
                    "scene_summary": scene.get("scene_summary", scene.get("summary", f"Scene {len(documents) + 1} content")),
                    "full_description": scene.get("full_description", scene.get("description", f"Video scene {len(documents) + 1} with visual content")),
                    "scene_embedding": scene.get("embedding", [0.1] * 768),
                    "transcript": scene.get("transcript", []),
                    "objects": scene.get("objects_tracked", scene.get("objects", [])),
                    "actions": scene.get("actions_detected", scene.get("actions", ["video_content"]))
                }
                
                # Add accurate transcription data if available
                if accurate_transcript and accurate_transcript.get("segments"):
                    # Find transcription segments that overlap with this scene
                    scene_start = scene.get("start_time_ms", 0)
                    scene_end = scene.get("end_time_ms", 5000)
                    
                    overlapping_segments = []
                    for segment in accurate_transcript.get("segments", []):
                        seg_start = getattr(segment, 'start_time_ms', 0) if hasattr(segment, 'start_time_ms') else segment.get("start_time_ms", 0)
                        seg_end = getattr(segment, 'end_time_ms', 0) if hasattr(segment, 'end_time_ms') else segment.get("end_time_ms", 0)
                        seg_text = getattr(segment, 'text', '') if hasattr(segment, 'text') else segment.get("text", "")
                        seg_conf = getattr(segment, 'confidence', 0.8) if hasattr(segment, 'confidence') else segment.get("confidence", 0.8)
                        
                        # Check for overlap
                        if (seg_start < scene_end and seg_end > scene_start):
                            overlapping_segments.append({
                                "text": seg_text,
                                "start_ms": seg_start,
                                "end_ms": seg_end,
                                "speaker": getattr(segment, 'speaker_id', 'unknown') if hasattr(segment, 'speaker_id') else segment.get("speaker_id", "unknown")
                            })
                    
                    if overlapping_segments:
                        doc["accurate_transcript"] = {
                            "segments": overlapping_segments,
                            "text": " ".join(seg.get("text", "") for seg in overlapping_segments),
                            "confidence": sum(seg.get("confidence", 0.8) for seg in overlapping_segments) / len(overlapping_segments) if overlapping_segments else 0.8,
                            "word_count": sum(len(seg.get("text", "").split()) for seg in overlapping_segments)
                        }
                
                documents.append(doc)
        else:
            # Create fallback documents if no scenes were generated
            logger.warning("no_scenes_generated_creating_fallback", video_id=video_id)
            
            # Create at least one document for searchability
            fallback_doc = {
                "video_id": video_id,
                "scene_id": f"{video_id}_scene_1",
                "start_time_ms": 0,
                "end_time_ms": metadata_result.get("duration_ms", 30000),
                "scene_summary": f"Video content for {video_id}",
                "full_description": f"This video has been processed and is available for search and analysis.",
                "scene_embedding": [0.1] * 768
            }
            
            # Add basic transcript info if available
            if transcription_result:
                fallback_doc["accurate_transcript"] = {
                    "segments": [],
                    "text": transcription_result.full_transcript,
                    "confidence": transcription_result.confidence,
                    "word_count": transcription_result.word_count
                }
            
            documents.append(fallback_doc)
        
        # Store scenes in Supabase for search (if available)
        stored_count = 0
        failed_count = 0

        if documents and supabase_service and supabase_service.is_available():
            try:
                logger.info("storing_scenes_in_supabase", video_id=video_id, scene_count=len(documents))

                for doc in documents:
                    success = await supabase_service.store_video_scene(doc)
                    if success:
                        stored_count += 1
                    else:
                        failed_count += 1

                logger.info("supabase_storage_completed",
                           video_id=video_id,
                           stored=stored_count,
                           failed=failed_count)

            except Exception as e:
                logger.error("supabase_storage_failed", video_id=video_id, error=str(e))
                failed_count = len(documents)
        elif not supabase_service or not supabase_service.is_available():
            logger.warning("supabase_not_available_skipping_storage", video_id=video_id)
        else:
            logger.warning("no_documents_created", video_id=video_id)
        
        # Clean up temporary file
        try:
            os.remove(temp_file_path)
        except:
            pass
        
        # Prepare response
        response = {
            "status": "success",
            "video_id": video_id,
            "thread_name": thread_name,
            "analysis": {
                "scenes_analyzed": len(metadata_result.get("scenes", [])),
                "total_duration_ms": metadata_result.get("duration_ms", 0),
                "transcript_available": bool(metadata_result.get("transcript")),
                "objects_detected": len(metadata_result.get("objects", [])),
            },
            "storage": {
                "scenes_stored": stored_count,
                "scenes_failed": failed_count,
                "supabase_available": supabase_service.is_available() if supabase_service else False
            },
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "scenes": metadata_result.get("scenes", []),
                "transcript": metadata_result.get("transcript", [])
            }
        }
        
        # Add transcription information if available
        if transcription_result:
            response["transcription"] = {
                "job_id": transcription_job_id,
                "status": "completed",
                "confidence": transcription_result.confidence,
                "confidence_level": transcription_result.confidence_level.value if transcription_result.confidence_level else "unknown",
                "segments_count": len(transcription_result.segments),
                "word_count": transcription_result.word_count,
                "processing_time": transcription_result.processing_time,
                "language": language
            }
        elif include_transcription:
            response["transcription"] = {
                "job_id": transcription_job_id,
                "status": "failed" if transcription_job_id else "not_requested",
                "message": "Transcription was requested but failed or timed out"
            }
        
        return response
        
    except Exception as e:
        logger.error("video_analysis_failed", 
                    video_id=video_id, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"Video analysis failed: {str(e)}")

@router.post("/analyze/mux-asset")
async def analyze_mux_asset(request: AnalyzeMuxAssetRequest) -> Dict[str, Any]:
    """
    Analyze a Mux asset by downloading it and running metadata generation.
    
    This endpoint:
    1. Fetches asset information from Mux
    2. Downloads the video file from Mux
    3. Runs metadata generation on the downloaded file
    4. Stores results in Supabase for search
    
    Args:
        request: Request containing Mux asset ID and analysis options
        
    Returns:
        Analysis results and storage status
    """
    # Initialize services on demand
    initialize_services()
    
    # Check if required services are available
    if not metadata_generator:
        raise HTTPException(
            status_code=503, 
            detail="Metadata generator not available. Check Gemini API configuration."
        )
    
    if not mux_service:
        raise HTTPException(
            status_code=503, 
            detail="Mux service not available. Check Mux API configuration."
        )
    
    try:
        # Generate video ID for database operations
        video_id = str(uuid.uuid4())
        thread_name = request.video_name or f"Mux Asset {request.mux_asset_id}"
        
        logger.info("mux_asset_analysis_started", 
                   video_id=video_id, 
                   mux_asset_id=request.mux_asset_id)
        
        # Get asset information from Mux
        asset = await mux_service.get_asset(request.mux_asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found in Mux")
        
        # Get playback ID for download
        playback_id = await mux_service.get_playback_id(request.mux_asset_id)
        if not playback_id:
            raise HTTPException(status_code=404, detail="Playback ID not found for asset")
        
        # Download video from Mux
        download_url = f"https://stream.mux.com/{playback_id}.mp4"
        temp_dir = tempfile.gettempdir()
        temp_file_path = os.path.join(temp_dir, f"mux_{video_id}_{request.mux_asset_id}.mp4")
        
        logger.info("downloading_mux_video", 
                   video_id=video_id, 
                   playback_id=playback_id,
                   download_url=download_url)
        
        response = requests.get(download_url, stream=True)
        response.raise_for_status()
        
        with open(temp_file_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        logger.info("mux_video_downloaded", 
                   video_id=video_id, 
                   file_size=os.path.getsize(temp_file_path))

        # 1. Generate audio transcription if requested (REUSED from upload)
        transcription_result = None
        transcription_job_id = None
        
        if request.include_transcription and audio_transcription_service:
            try:
                logger.info("starting_audio_transcription", video_id=video_id)
                transcription_job_id = await audio_transcription_service.transcribe_video(
                    video_path=temp_file_path,
                    video_id=video_id,
                    language=request.language
                )
                
                # Wait for transcription to complete (with timeout)
                max_wait_time = 300  # 5 minutes
                wait_time = 0
                poll_interval = 5  # 5 seconds
                
                while wait_time < max_wait_time:
                    try:
                        job_status = await audio_transcription_service.get_transcription_status(transcription_job_id)
                        if job_status["status"] == "completed":
                            transcription_result = await audio_transcription_service.get_transcription_result(transcription_job_id)
                            break
                        elif job_status["status"] == "failed":
                            break
                        await asyncio.sleep(poll_interval)
                        wait_time += poll_interval
                    except Exception:
                        break
            except Exception as transcription_error:
                logger.error("transcription_service_failed", video_id=video_id, error=str(transcription_error))
        
        # 2. Generate metadata using the downloaded file
        metadata_result = await metadata_generator.generate_metadata(
            video_path=temp_file_path,
            video_id=video_id
        )
        
        if transcription_result:
            metadata_result["accurate_transcript"] = {
                "full_transcript": transcription_result.full_transcript,
                "segments": [
                    {
                        "text": s.text,
                        "start_time_ms": s.start_time_ms,
                        "end_time_ms": s.end_time_ms,
                        "confidence": s.confidence
                    } for s in transcription_result.segments
                ]
            }

        # 3. Process and index the metadata (REUSED from upload)
        documents = []
        if metadata_result and "scenes" in metadata_result and len(metadata_result["scenes"]) > 0:
            accurate_transcript = metadata_result.get("accurate_transcript", {})
            for scene in metadata_result["scenes"]:
                doc = {
                    "video_id": video_id,
                    "scene_id": f"{video_id}_scene_{scene.get('scene_number', len(documents) + 1)}",
                    "start_time_ms": scene.get("start_time_ms", 0),
                    "end_time_ms": scene.get("end_time_ms", 5000),
                    "scene_summary": scene.get("scene_summary", scene.get("summary", f"Scene {len(documents) + 1} content")),
                    "full_description": scene.get("full_description", scene.get("description", f"Video scene {len(documents) + 1} with visual content")),
                    "scene_embedding": scene.get("embedding", [0.1] * 768),
                    "transcript": scene.get("transcript", []),
                    "objects": scene.get("objects_tracked", scene.get("objects", [])),
                    "actions": scene.get("actions_detected", scene.get("actions", ["video_content"]))
                }
                
                # Add accurate transcription segments
                if accurate_transcript and accurate_transcript.get("segments"):
                    scene_start = doc["start_time_ms"]
                    scene_end = doc["end_time_ms"]
                    overlapping = [s for s in accurate_transcript["segments"] if s["start_time_ms"] < scene_end and s["end_time_ms"] > scene_start]
                    if overlapping:
                        doc["accurate_transcript"] = {
                            "segments": overlapping,
                            "text": " ".join(s["text"] for s in overlapping)
                        }
                documents.append(doc)
        
        # Store in Supabase
        stored_count = 0
        failed_count = 0
        if documents and supabase_service and supabase_service.is_available():
            for doc in documents:
                if await supabase_service.store_video_scene(doc):
                    stored_count += 1
                else:
                    failed_count += 1
        
        # Clean up temporary file
        try:
            os.remove(temp_file_path)
        except:
            pass
        
        # Prepare response
        return {
            "status": "success",
            "video_id": video_id,
            "mux_asset_id": request.mux_asset_id,
            "thread_name": thread_name,
            "analysis": {
                "scenes_analyzed": len(metadata_result.get("scenes", [])),
                "total_duration_ms": metadata_result.get("duration_ms", 0),
                "transcript_available": bool(metadata_result.get("transcript")),
                "objects_detected": len(metadata_result.get("objects", [])),
            },
            "timestamp": datetime.utcnow().isoformat(),
            "data": {
                "scenes": metadata_result.get("scenes", []),
                "transcript": metadata_result.get("transcript", [])
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("mux_asset_analysis_failed", 
                    mux_asset_id=request.mux_asset_id, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"Mux asset analysis failed: {str(e)}")


@router.get("/search")
async def search_video_content(
    query: str,
    min_score: float = 0.7,
    max_results: int = 20,
    video_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Search video content using semantic search with Supabase.

    Args:
        query: Search query
        min_score: Minimum relevance score (0-1)
        max_results: Maximum number of results
        video_id: Optional filter by specific video

    Returns:
        Search results with timestamps and relevance scores
    """
    # Initialize services on demand
    initialize_services()

    if not supabase_service or not supabase_service.is_available():
        return {
            "status": "unavailable",
            "query": query,
            "results_count": 0,
            "results": [],
            "message": "Video search is not available - Supabase not configured",
            "timestamp": datetime.utcnow().isoformat()
        }

    try:
        logger.info("search_request",
                   query=query,
                   video_id=video_id,
                   min_score=min_score)

        # Generate REAL embedding for the query using MetadataGenerator
        if not metadata_generator:
            raise HTTPException(status_code=503, detail="Metadata generator not available for embeddings")
        
        query_embedding = await metadata_generator.generate_text_embedding(query)

        # Perform search
        results = await supabase_service.search_video_content(
            query_embedding=query_embedding,
            video_id=video_id,
            limit=max_results,
            similarity_threshold=min_score
        )

        return {
            "status": "success",
            "query": query,
            "results_count": len(results),
            "results": results,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error("search_failed", query=query, error=str(e))
        return {
            "status": "error",
            "query": query,
            "results_count": 0,
            "results": [],
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }




@router.delete("/video/{video_id}")
async def delete_video_data(video_id: str) -> Dict[str, Any]:
    """
    Delete all data for a specific video from Supabase.

    Args:
        video_id: The video ID to delete

    Returns:
        Deletion status and count
    """
    # Initialize services on demand
    initialize_services()

    if not supabase_service or not supabase_service.is_available():
        return {
            "status": "unavailable",
            "video_id": video_id,
            "message": "Video deletion not available - Supabase not configured",
            "timestamp": datetime.utcnow().isoformat()
        }

    try:
        # Delete all scenes for this video
        success = await supabase_service.delete_video_scenes(video_id)

        if success:
            logger.info("video_data_deleted",
                       video_id=video_id,
                       message="Scenes deleted from Supabase")

            return {
                "status": "success",
                "video_id": video_id,
                "message": "Video scenes deleted from search database",
                "timestamp": datetime.utcnow().isoformat()
            }
        else:
            return {
                "status": "error",
                "video_id": video_id,
                "message": "Failed to delete video scenes",
                "timestamp": datetime.utcnow().isoformat()
            }

    except Exception as e:
        logger.error("video_deletion_failed", video_id=video_id, error=str(e))
        return {
            "status": "error",
            "video_id": video_id,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }

@router.get("/video/{video_id}")
async def get_video_details(video_id: str) -> Dict[str, Any]:
    """
    Get details for a specific video including scenes and metadata.
    
    Args:
        video_id: The video ID
        
    Returns:
        Video details with scenes
    """
    initialize_services()
    
    if not supabase_service or not supabase_service.is_available():
        raise HTTPException(status_code=503, detail="Supabase not available")
        
    try:
        # Get all scenes for this video
        scenes = await supabase_service.get_video_scenes(video_id)
        
        if not scenes:
            # Check if the video exists in the videos table (for uploaded videos)
            video = await supabase_service.get_video(video_id)
            if video:
                return {
                    "status": "success",
                    "video": video,
                    "scenes": []
                }
            else:
                raise HTTPException(status_code=404, detail="Video not found")
        
        # Aggregate scene data to create video info
        total_scenes = len(scenes)
        total_duration = max(scene.get('end_time_ms', 0) for scene in scenes) if scenes else 0
        
        # Collect all objects and actions
        all_objects = []
        all_actions = []
        transcripts = []
        
        for scene in scenes:
            if scene.get('objects_tracked'):
                all_objects.extend(scene['objects_tracked'])
            if scene.get('actions_detected'):
                all_actions.extend(scene['actions_detected'])
            if scene.get('accurate_transcript'):
                transcripts.append(scene['accurate_transcript'])
        
        # Create aggregated video info from scenes
        video_info = {
            "video_id": video_id,
            "scenes_count": total_scenes,
            "total_duration_ms": total_duration,
            "objects_detected": len(set(all_objects)),  # Unique objects
            "actions_detected": list(set(all_actions)),  # Unique actions
            "has_transcript": len(transcripts) > 0,
            "scenes": scenes,
            "analysis_timestamp": datetime.utcnow().isoformat()
        }
        
        return {
            "status": "success",
            "video": video_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_video_details_failed", video_id=video_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
