"""
Video Analysis API Routes

This module provides endpoints for video analysis, metadata extraction,
and Elasticsearch integration.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Dict, Any, List, Optional
import structlog
import asyncio
import json
import os
from datetime import datetime

from services.elastic_service import ElasticService
from services.metadata_generator import MetadataGenerator
from services.audio import AudioTranscriptionService

logger = structlog.get_logger()

router = APIRouter(prefix="/analysis", tags=["Video Analysis"])

# Initialize services with better error handling
elastic_service = None
metadata_generator = None
audio_transcription_service = None

def initialize_services():
    """Initialize services on demand"""
    global elastic_service, metadata_generator, audio_transcription_service
    
    if elastic_service is None:
        try:
            logger.info("Initializing ElasticService...")
            elastic_service = ElasticService()
            logger.info("ElasticService initialized successfully")
        except Exception as e:
            logger.error("ElasticService initialization failed", error=str(e))
            elastic_service = None
    
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
    
    return elastic_service is not None and metadata_generator is not None


@router.post("/upload")
async def analyze_video(
    file: UploadFile = File(...),
    video_id: Optional[str] = Form(None),
    include_transcription: bool = Form(False),
    language: str = Form("en-US")
) -> Dict[str, Any]:
    """
    Upload and analyze a video file with optional audio transcription.
    
    This endpoint:
    1. Accepts a video file upload
    2. Optionally generates accurate audio transcription
    3. Generates metadata and scene analysis
    4. Creates embeddings for the content
    5. Indexes the data in Elasticsearch with enhanced transcript data
    
    Args:
        file: The video file to analyze
        video_id: Optional custom video ID
        include_transcription: Whether to include accurate audio transcription
        language: Language code for transcription (e.g., en-US, es-ES)
        
    Returns:
        Analysis results, transcription status, and indexing information
    """
    # Initialize services on demand
    services_ready = initialize_services()
    
    if not services_ready:
        raise HTTPException(
            status_code=503, 
            detail="Analysis services not available. Check Elasticsearch and Gemini API configuration."
        )
    
    try:
        # Generate video ID if not provided
        if not video_id:
            video_id = f"video_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        logger.info("video_analysis_started", 
                   video_id=video_id, 
                   filename=file.filename,
                   content_type=file.content_type)
        
        # Save uploaded file temporarily
        temp_file_path = f"/tmp/{video_id}_{file.filename}"
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
        
        # Process and index the metadata
        indexed_count = 0
        failed_count = 0
        
        if metadata_result and "scenes" in metadata_result:
            logger.info("indexing_scenes", 
                       video_id=video_id, 
                       scene_count=len(metadata_result["scenes"]))
            
            # Prepare documents for bulk indexing
            documents = []
            accurate_transcript = metadata_result.get("accurate_transcript", {})
            
            for scene in metadata_result["scenes"]:
                # Create document structure for Elasticsearch
                doc = {
                    "video_id": video_id,
                    "scene_id": f"{video_id}_scene_{scene.get('scene_number', 0)}",
                    "start_time_ms": scene.get("start_time_ms", 0),
                    "end_time_ms": scene.get("end_time_ms", 0),
                    "scene_summary": scene.get("summary", ""),
                    "full_description": scene.get("description", ""),
                    "scene_embedding": scene.get("embedding", []),
                    "transcript_phrases": scene.get("transcript", []),
                    "objects_tracked": scene.get("objects", []),
                    "actions_detected": scene.get("actions", [])
                }
                
                # Add accurate transcription data if available
                if accurate_transcript:
                    # Find transcription segments that overlap with this scene
                    scene_start = scene.get("start_time_ms", 0)
                    scene_end = scene.get("end_time_ms", 0)
                    
                    overlapping_segments = []
                    for segment in accurate_transcript.get("segments", []):
                        seg_start = segment.get("start_time_ms", 0)
                        seg_end = segment.get("end_time_ms", 0)
                        
                        # Check for overlap
                        if (seg_start < scene_end and seg_end > scene_start):
                            overlapping_segments.append(segment)
                    
                    if overlapping_segments:
                        doc["accurate_transcript"] = {
                            "segments": overlapping_segments,
                            "text": " ".join(seg.get("text", "") for seg in overlapping_segments),
                            "confidence": sum(seg.get("confidence", 0) for seg in overlapping_segments) / len(overlapping_segments),
                            "word_count": sum(len(seg.get("text", "").split()) for seg in overlapping_segments)
                        }
                
                documents.append(doc)
            
            # Bulk index documents
            try:
                success_count, failed_operations = await elastic_service.bulk_index_documents(documents)
                indexed_count = success_count
                failed_count = len(failed_operations)
                
                logger.info("indexing_completed",
                           video_id=video_id,
                           indexed=indexed_count,
                           failed=failed_count)
                
            except Exception as e:
                logger.error("indexing_failed", video_id=video_id, error=str(e))
                raise HTTPException(status_code=500, detail=f"Failed to index documents: {str(e)}")
        
        # Clean up temporary file
        try:
            os.remove(temp_file_path)
        except:
            pass
        
        # Prepare response
        response = {
            "status": "success",
            "video_id": video_id,
            "analysis": {
                "scenes_analyzed": len(metadata_result.get("scenes", [])),
                "total_duration_ms": metadata_result.get("duration_ms", 0),
                "transcript_available": bool(metadata_result.get("transcript")),
                "objects_detected": len(metadata_result.get("objects", [])),
            },
            "indexing": {
                "documents_indexed": indexed_count,
                "documents_failed": failed_count,
                "elasticsearch_index": elastic_service.index_name if elastic_service else None
            },
            "timestamp": datetime.utcnow().isoformat()
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


@router.get("/search")
async def search_video_content(
    query: str,
    min_score: float = 0.7,
    max_results: int = 20,
    video_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Search video content using semantic search.
    
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
    
    if not elastic_service:
        raise HTTPException(
            status_code=503, 
            detail="Search service not available. Check Elasticsearch configuration."
        )
    
    try:
        logger.info("search_request", 
                   query=query, 
                   video_id=video_id,
                   min_score=min_score)
        
        # Perform search
        results = await elastic_service.search_video_content(
            query=query,
            min_score=min_score,
            max_results=max_results
        )
        
        # Filter by video_id if specified
        if video_id:
            results = [r for r in results if r.get("video_id") == video_id]
        
        return {
            "status": "success",
            "query": query,
            "results_count": len(results),
            "results": results,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error("search_failed", query=query, error=str(e))
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/test-index")
async def test_index_document() -> Dict[str, Any]:
    """
    Test indexing a sample document to verify Elasticsearch is working.
    """
    if not elastic_service:
        return {"error": "Elasticsearch service not available"}
    
    try:
        # Create a test document
        test_doc = {
            "video_id": "test_video_001",
            "scene_id": "test_video_001_scene_001",
            "start_time_ms": 0,
            "end_time_ms": 5000,
            "scene_summary": "Test scene with a person speaking",
            "full_description": "This is a test scene showing a person speaking to the camera",
            "scene_embedding": [0.1] * 768,  # Mock embedding
            "transcript_phrases": [
                {
                    "text": "Hello, this is a test video",
                    "start_ms": 0,
                    "end_ms": 3000,
                    "speaker": "narrator"
                }
            ],
            "objects_tracked": [
                {
                    "label": "person",
                    "track_id": "person_1",
                    "boxes": []
                }
            ],
            "actions_detected": ["speaking"]
        }
        
        # Index the test document
        response = elastic_service.es_client.index(
            index=elastic_service.index_name,
            document=test_doc,
            id="test_doc_001"
        )
        
        return {
            "status": "success",
            "document_indexed": True,
            "elasticsearch_response": {
                "result": response.get("result", "unknown"),
                "index": response.get("_index", "unknown"),
                "id": response.get("_id", "unknown")
            },
            "test_document_id": test_doc["scene_id"]
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "error_type": type(e).__name__
        }


@router.get("/test-search")
async def test_search(query: str = "video") -> Dict[str, Any]:
    """
    Test search functionality with debug information.
    """
    if not elastic_service:
        return {"error": "Elasticsearch service not available"}
    
    try:
        # Simple search to test if documents exist
        response = elastic_service.es_client.search(
            index=elastic_service.index_name,
            body={
                "query": {"match_all": {}},
                "size": 5
            }
        )
        
        return {
            "total_documents": response["hits"]["total"]["value"],
            "documents_found": len(response["hits"]["hits"]),
            "sample_documents": [hit["_source"] for hit in response["hits"]["hits"]],
            "index_name": elastic_service.index_name
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "error_type": type(e).__name__
        }


@router.get("/elasticsearch/status")
async def elasticsearch_status() -> Dict[str, Any]:
    """
    Check Elasticsearch connection and index status.
    
    Returns:
        Elasticsearch connection and index information
    """
    # Try to initialize services
    initialize_services()
    
    if not elastic_service:
        return {
            "status": "disconnected",
            "error": "Elasticsearch service not initialized"
        }
    
    try:
        # Check connection
        is_connected = elastic_service.es_client.ping()
        
        # Get index info
        index_exists = elastic_service.es_client.indices.exists(index=elastic_service.index_name)
        
        index_stats = {}
        if index_exists:
            try:
                # Try to get stats (may not work in serverless mode)
                stats = elastic_service.es_client.indices.stats(index=elastic_service.index_name)
                index_stats = {
                    "document_count": stats["indices"][elastic_service.index_name]["total"]["docs"]["count"],
                    "index_size": stats["indices"][elastic_service.index_name]["total"]["store"]["size_in_bytes"]
                }
            except Exception as stats_error:
                # Fallback: use search to count documents
                try:
                    count_response = elastic_service.es_client.count(index=elastic_service.index_name)
                    index_stats = {
                        "document_count": count_response["count"],
                        "index_size": "unknown (serverless mode)"
                    }
                except Exception as count_error:
                    index_stats = {
                        "document_count": "unknown",
                        "index_size": "unknown",
                        "error": "Cannot access stats in serverless mode"
                    }
        
        return {
            "status": "connected" if is_connected else "disconnected",
            "index_name": str(elastic_service.index_name),
            "index_exists": bool(index_exists),
            "index_stats": index_stats,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error("elasticsearch_status_check_failed", error=str(e))
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@router.get("/scene/{video_id}/{scene_id}")
async def get_scene_context(video_id: str, scene_id: str) -> Dict[str, Any]:
    """
    Get structured context for a specific scene.
    
    Args:
        video_id: The video identifier
        scene_id: The scene identifier
        
    Returns:
        Scene context with metadata, transcript, and objects
    """
    if not elastic_service:
        raise HTTPException(
            status_code=503, 
            detail="Elasticsearch service not available"
        )
    
    try:
        logger.info("getting_scene_context", video_id=video_id, scene_id=scene_id)
        
        # Search for the specific scene
        query = {
            "query": {
                "bool": {
                    "must": [
                        {"term": {"video_id": video_id}},
                        {"term": {"scene_id": scene_id}}
                    ]
                }
            }
        }
        
        response = elastic_service.es_client.search(
            index=elastic_service.index_name,
            body=query
        )
        
        if response["hits"]["total"]["value"] > 0:
            scene_data = response["hits"]["hits"][0]["_source"]
            return {
                "status": "success",
                "scene_context": scene_data,
                "timestamp": datetime.utcnow().isoformat()
            }
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Scene {scene_id} not found for video {video_id}"
            )
            
    except Exception as e:
        logger.error("get_scene_context_failed", video_id=video_id, scene_id=scene_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to get scene context: {str(e)}")


@router.delete("/video/{video_id}")
async def delete_video_data(video_id: str) -> Dict[str, Any]:
    """
    Delete all data for a specific video from Elasticsearch.
    
    Args:
        video_id: The video ID to delete
        
    Returns:
        Deletion status and count
    """
    if not elastic_service:
        raise HTTPException(
            status_code=503, 
            detail="Elasticsearch service not available"
        )
    
    try:
        # Delete all documents for this video
        delete_query = {
            "query": {
                "term": {
                    "video_id": video_id
                }
            }
        }
        
        response = elastic_service.es_client.delete_by_query(
            index=elastic_service.index_name,
            body=delete_query
        )
        
        deleted_count = response.get("deleted", 0)
        
        logger.info("video_data_deleted", 
                   video_id=video_id, 
                   deleted_count=deleted_count)
        
        return {
            "status": "success",
            "video_id": video_id,
            "deleted_documents": deleted_count,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error("video_deletion_failed", video_id=video_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to delete video data: {str(e)}")