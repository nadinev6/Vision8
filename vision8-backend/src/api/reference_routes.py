"""
Reference Image API Routes

Provides endpoints for managing reference images including:
- Upload and storage
- Retrieval and listing
- Deletion and cleanup
- Similarity search
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import structlog

from ..services.reference_image_service import (
    reference_image_service, 
    ReferenceImageResponse, 
    ReferenceImage
)

logger = structlog.get_logger()
router = APIRouter(prefix="/api/v1", tags=["Reference Images"])

# =========================================================================
# Request/Response Models
# =========================================================================
class ReferenceImageListResponse(BaseModel):
    """Response model for listing reference images."""
    images: List[ReferenceImageResponse]
    total: int
    page: int
    limit: int


class SimilaritySearchRequest(BaseModel):
    """Request model for similarity search."""
    embedding: List[float]
    user_id: Optional[str] = None
    threshold: float = 0.7
    limit: int = 5


class SimilaritySearchResponse(BaseModel):
    """Response model for similarity search results."""
    similar_images: List[Dict[str, Any]]
    query_embedding_dimension: int
    search_time_ms: float


class UpdateReferenceRequest(BaseModel):
    """Request model for updating reference image."""
    description: Optional[str] = None
    is_starred: Optional[bool] = None
    user_rating: Optional[int] = None


# =========================================================================
# Dependency Injection
# =========================================================================
async def get_reference_service():
    """Get the global reference image service instance."""
    return reference_image_service


# =========================================================================
# Upload Endpoints
# =========================================================================
@router.post("/reference-images/upload", response_model=ReferenceImageResponse)
async def upload_reference_image(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    video_id: Optional[str] = Form(None),
    usage_type: str = Form("environment_lock"),
    description: Optional[str] = Form(None),
    service: reference_image_service = Depends(get_reference_service)
):
    """
    Upload a reference image for video generation workflows.
    
    Args:
        file: Image file to upload
        user_id: User who owns this reference
        video_id: Associated video (optional)
        usage_type: How the image will be used ("environment_lock", "object_reference", "lipsync_reference")
        description: User's description of the image
        
    Returns:
        ReferenceImageResponse with upload details
    """
    try:
        # Validate usage_type
        valid_types = {"environment_lock", "object_reference", "lipsync_reference"}
        if usage_type not in valid_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid usage_type. Must be one of: {', '.join(valid_types)}"
            )
        
        result = await service.upload_reference(
            file=file,
            user_id=user_id,
            video_id=video_id,
            usage_type=usage_type,
            description=description
        )
        
        logger.info("Reference image uploaded successfully", 
                   reference_id=result.id, user_id=user_id, usage_type=usage_type)
        
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to upload reference image", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


# =========================================================================
# Retrieval Endpoints
# =========================================================================
@router.get("/reference-images", response_model=ReferenceImageListResponse)
async def list_reference_images(
    user_id: str,
    video_id: Optional[str] = None,
    usage_type: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    service: reference_image_service = Depends(get_reference_service)
):
    """
    List reference images for a user.
    
    Args:
        user_id: User to list references for
        video_id: Filter by specific video (optional)
        usage_type: Filter by usage type (optional)
        page: Page number (1-indexed)
        limit: Number of items per page
        
    Returns:
        ReferenceImageListResponse with paginated results
    """
    try:
        # Validate pagination
        if page < 1:
            raise HTTPException(status_code=400, detail="Page must be >= 1")
        if limit < 1 or limit > 100:
            raise HTTPException(status_code=400, detail="Limit must be between 1 and 100")
        
        # Validate usage_type if provided
        if usage_type:
            valid_types = {"environment_lock", "object_reference", "lipsync_reference"}
            if usage_type not in valid_types:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid usage_type. Must be one of: {', '.join(valid_types)}"
                )
        
        # Get references from service
        references = await service.list_user_references(
            user_id=user_id,
            video_id=video_id,
            usage_type=usage_type,
            limit=limit
        )
        
        # Convert to response format
        images = [
            ReferenceImageResponse(
                id=ref.id,
                firebase_url=ref.firebase_url,
                usage_type=ref.usage_type,
                metadata=ref.metadata,
                created_at=ref.created_at,
                expires_at=ref.expires_at,
                is_starred=ref.is_starred
            )
            for ref in references
        ]
        
        # Calculate pagination
        total = len(images)  # In real implementation, this would be total count from DB
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_images = images[start_idx:end_idx]
        
        return ReferenceImageListResponse(
            images=paginated_images,
            total=total,
            page=page,
            limit=limit
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to list reference images", user_id=user_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/reference-images/{reference_id}", response_model=ReferenceImageResponse)
async def get_reference_image(
    reference_id: str,
    service: reference_image_service = Depends(get_reference_service)
):
    """
    Get a specific reference image by ID.
    
    Args:
        reference_id: Reference image ID
        
    Returns:
        ReferenceImageResponse with image details
    """
    try:
        reference = await service.get_reference_image(reference_id)
        
        if not reference:
            raise HTTPException(status_code=404, detail="Reference image not found")
        
        return ReferenceImageResponse(
            id=reference.id,
            firebase_url=reference.firebase_url,
            usage_type=reference.usage_type,
            metadata=reference.metadata,
            created_at=reference.created_at,
            expires_at=reference.expires_at,
            is_starred=reference.is_starred
        )
        
    except HTTPException:
        raise
    except NotImplementedError:
        raise HTTPException(status_code=501, detail="Database integration not implemented")
    except Exception as e:
        logger.error("Failed to get reference image", reference_id=reference_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


# =========================================================================
# Update/Delete Endpoints
# =========================================================================
@router.put("/reference-images/{reference_id}", response_model=ReferenceImageResponse)
async def update_reference_image(
    reference_id: str,
    request: UpdateReferenceRequest,
    user_id: str,  # In real implementation, get from auth token
    service: reference_image_service = Depends(get_reference_service)
):
    """
    Update reference image metadata.
    
    Args:
        reference_id: Reference image ID to update
        request: Update request with new values
        user_id: User making the request (for authorization)
        
    Returns:
        Updated ReferenceImageResponse
    """
    try:
        # Validate user rating
        if request.user_rating is not None and (request.user_rating < 1 or request.user_rating > 5):
            raise HTTPException(status_code=400, detail="User rating must be between 1 and 5")
        
        # Get existing reference
        reference = await service.get_reference_image(reference_id)
        
        if not reference:
            raise HTTPException(status_code=404, detail="Reference image not found")
        
        # Verify ownership
        if reference.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this reference")
        
        # Update fields (implementation would update in database)
        if request.description is not None:
            reference.metadata["description"] = request.description
        if request.is_starred is not None:
            reference.is_starred = request.is_starred
        if request.user_rating is not None:
            reference.user_rating = request.user_rating
        
        # Update usage stats
        await service.update_usage_stats(reference_id)
        
        logger.info("Reference image updated", reference_id=reference_id, user_id=user_id)
        
        return ReferenceImageResponse(
            id=reference.id,
            firebase_url=reference.firebase_url,
            usage_type=reference.usage_type,
            metadata=reference.metadata,
            created_at=reference.created_at,
            expires_at=reference.expires_at,
            is_starred=reference.is_starred
        )
        
    except HTTPException:
        raise
    except NotImplementedError:
        raise HTTPException(status_code=501, detail="Database integration not implemented")
    except Exception as e:
        logger.error("Failed to update reference image", reference_id=reference_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/reference-images/{reference_id}")
async def delete_reference_image(
    reference_id: str,
    user_id: str,  # In real implementation, get from auth token
    service: reference_image_service = Depends(get_reference_service)
):
    """
    Delete a reference image.
    
    Args:
        reference_id: Reference image ID to delete
        user_id: User making the request (for authorization)
        
    Returns:
        Success confirmation
    """
    try:
        deleted = await service.delete_reference_image(reference_id, user_id)
        
        if not deleted:
            raise HTTPException(status_code=404, detail="Reference image not found or not authorized")
        
        logger.info("Reference image deleted successfully", reference_id=reference_id, user_id=user_id)
        
        return {"message": "Reference image deleted successfully"}
        
    except HTTPException:
        raise
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except NotImplementedError:
        raise HTTPException(status_code=501, detail="Database integration not implemented")
    except Exception as e:
        logger.error("Failed to delete reference image", reference_id=reference_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


# =========================================================================
# Search Endpoints
# =========================================================================
@router.post("/reference-images/search-similar", response_model=SimilaritySearchResponse)
async def search_similar_references(
    request: SimilaritySearchRequest,
    service: reference_image_service = Depends(get_reference_service)
):
    """
    Find similar reference images using semantic search.
    
    Args:
        request: Search request with embedding and parameters
        
    Returns:
        SimilaritySearchResponse with similar images
    """
    try:
        import time
        start_time = time.time()
        
        # Validate embedding
        if not request.embedding or len(request.embedding) == 0:
            raise HTTPException(status_code=400, detail="Embedding cannot be empty")
        
        # Validate threshold
        if request.threshold < 0 or request.threshold > 1:
            raise HTTPException(status_code=400, detail="Threshold must be between 0 and 1")
        
        # Validate limit
        if request.limit < 1 or request.limit > 20:
            raise HTTPException(status_code=400, detail="Limit must be between 1 and 20")
        
        # Perform similarity search
        similar_references = await service.get_similar_references(
            embedding=request.embedding,
            user_id=request.user_id,
            threshold=request.threshold,
            limit=request.limit
        )
        
        # Format response
        similar_images = []
        for ref in similar_references:
            similar_images.append({
                "id": ref.id,
                "firebase_url": ref.firebase_url,
                "usage_type": ref.usage_type,
                "metadata": ref.metadata,
                "similarity_score": getattr(ref, 'similarity_score', 0.0),  # Would come from DB query
                "created_at": ref.created_at.isoformat() if ref.created_at else None
            })
        
        search_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        
        return SimilaritySearchResponse(
            similar_images=similar_images,
            query_embedding_dimension=len(request.embedding),
            search_time_ms=round(search_time, 2)
        )
        
    except HTTPException:
        raise
    except NotImplementedError:
        raise HTTPException(status_code=501, detail="Similarity search not implemented")
    except Exception as e:
        logger.error("Failed to search similar references", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


# =========================================================================
# Utility Endpoints
# =========================================================================
@router.post("/reference-images/cleanup-expired")
async def cleanup_expired_references(
    user_id: Optional[str] = None,  # If provided, only clean user's references
    service: reference_image_service = Depends(get_reference_service)
):
    """
    Clean up expired reference images.
    
    Args:
        user_id: Optional user filter for cleanup
        
    Returns:
        Cleanup results
    """
    try:
        await service.cleanup_expired_references()
        
        return {
            "message": "Expired reference cleanup completed",
            "timestamp": "2025-12-26T18:00:00Z",  # Would use actual timestamp
            "user_filter": user_id
        }
        
    except Exception as e:
        logger.error("Failed to cleanup expired references", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/reference-images/usage-stats")
async def get_reference_usage_stats(
    user_id: str,
    service: reference_image_service = Depends(get_reference_service)
):
    """
    Get usage statistics for user's reference images.
    
    Args:
        user_id: User to get stats for
        
    Returns:
        Usage statistics
    """
    try:
        # Get user's references
        references = await service.list_user_references(user_id=user_id)
        
        # Calculate statistics
        total_references = len(references)
        by_usage_type = {}
        by_age = {}
        total_usage_count = 0
        
        for ref in references:
            # Count by usage type
            usage_type = ref.usage_type
            by_usage_type[usage_type] = by_usage_type.get(usage_type, 0) + 1
            
            # Count usage
            total_usage_count += ref.times_used
            
            # Count by age (simple bins)
            age_days = (ref.created_at - ref.created_at).days  # Would calculate actual age
            if age_days < 7:
                age_group = "week"
            elif age_days < 30:
                age_group = "month"
            else:
                age_group = "older"
            by_age[age_group] = by_age.get(age_group, 0) + 1
        
        return {
            "user_id": user_id,
            "total_references": total_references,
            "by_usage_type": by_usage_type,
            "by_age": by_age,
            "total_usage_count": total_usage_count,
            "average_usage_per_reference": total_usage_count / total_references if total_references > 0 else 0,
            "most_used_usage_type": max(by_usage_type.items(), key=lambda x: x[1])[0] if by_usage_type else None
        }
        
    except NotImplementedError:
        # Return mock data for now
        return {
            "user_id": user_id,
            "total_references": 0,
            "by_usage_type": {},
            "by_age": {},
            "total_usage_count": 0,
            "average_usage_per_reference": 0,
            "most_used_usage_type": None,
            "note": "Database integration required for real statistics"
        }
    except Exception as e:
        logger.error("Failed to get usage stats", user_id=user_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")
