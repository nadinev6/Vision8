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

logger = structlog.get_logger()

router = APIRouter(prefix="/analysis", tags=["Video Analysis"])

# Initialize services
try:
    elastic_service = ElasticService()
    metadata_generator = MetadataGenerator()
    logger.info("video_analysis_services_initialized")
except Exception as e:
    logger.error("failed_to_initialize_services", error=str(e))
    elastic_service = None
    metadata_generator = None


@router.post("/upload")
async def analyze_video(
    file: UploadFile = File(...),
    video_id: Optional[str] = Form(None)
) -> Dict[str, Any]:
    """
    Upload and analyze a video file.
    
    This endpoint:
    1. Accepts a video file upload
    2. Generates metadata and scene analysis
    3. Creates embeddings for the content
    4. Indexes the data in Elasticsearch
    
    Args:
        file: The video file to analyze
        video_id: Optional custom video ID
        
    Returns:
        Analysis results and indexing status
    """
    if not elastic_service or not metadata_generator:
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
        
        # Generate metadata using the metadata generator
        logger.info("generating_metadata", video_id=video_id)
        metadata_result = await metadata_generator.generate_metadata(
            video_path=temp_file_path,
            video_id=video_id
        )
        
        # Process and index the metadata
        indexed_count = 0
        failed_count = 0
        
        if metadata_result and "scenes" in metadata_result:
            logger.info("indexing_scenes", 
                       video_id=video_id, 
                       scene_count=len(metadata_result["scenes"]))
            
            # Prepare documents for bulk indexing
            documents = []
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
        
        return {
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


@router.get("/elasticsearch/status")
async def elasticsearch_status() -> Dict[str, Any]:
    """
    Check Elasticsearch connection and index status.
    
    Returns:
        Elasticsearch connection and index information
    """
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
            stats = elastic_service.es_client.indices.stats(index=elastic_service.index_name)
            index_stats = {
                "document_count": stats["indices"][elastic_service.index_name]["total"]["docs"]["count"],
                "index_size": stats["indices"][elastic_service.index_name]["total"]["store"]["size_in_bytes"]
            }
        
        return {
            "status": "connected" if is_connected else "disconnected",
            "index_name": elastic_service.index_name,
            "index_exists": index_exists,
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