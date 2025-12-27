"""
Reference Image Service for Vision8

Manages reference images for video generation workflows including:
- Upload and storage in Firebase
- Metadata extraction and analysis
- Semantic search via embeddings
- Usage tracking and history
"""
import os
import uuid
import re
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import structlog
from fastapi import UploadFile
from PIL import Image
import json

logger = structlog.get_logger()

# =========================================================================
# Data Models
# =========================================================================
@dataclass
class ReferenceImage:
    """Reference image data model."""
    id: str
    user_id: str
    video_id: Optional[str]
    firebase_url: str
    usage_type: str  # "environment_lock", "object_reference", "lipsync_reference"
    metadata: Dict[str, Any]
    embedding: Optional[List[float]] = None
    created_at: datetime = None
    expires_at: Optional[datetime] = None
    is_starred: bool = False
    times_used: int = 0
    last_used_at: Optional[datetime] = None
    user_rating: Optional[int] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()
        if self.expires_at is None:
            # Default 30 days expiry
            self.expires_at = self.created_at + timedelta(days=30)


@dataclass
class ReferenceImageResponse:
    """Response model for reference image operations."""
    id: str
    firebase_url: str
    usage_type: str
    metadata: Dict[str, Any]
    created_at: datetime
    expires_at: Optional[datetime] = None
    is_starred: bool = False


# =========================================================================
# Reference Image Service
# =========================================================================
class ReferenceImageService:
    """
    Service for managing reference images across the Vision8 system.
    
    Features:
    - Upload to Firebase Storage
    - Metadata extraction and embedding generation
    - Semantic search for similar references
    - Usage tracking and analytics
    - Auto-cleanup of expired references
    """
    
    def __init__(self):
        self.firebase_bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET", "vision8-e7683.appspot.com")
        self.embedding_model = "text-embedding-004"  # Gemini embeddings
        self.max_file_size = 10 * 1024 * 1024  # 10MB
        self.supported_formats = {"JPEG", "JPG", "PNG", "WEBP"}
        
    async def upload_reference(
        self,
        file: UploadFile,
        user_id: str,
        video_id: Optional[str] = None,
        usage_type: str = "environment_lock",
        description: Optional[str] = None
    ) -> ReferenceImageResponse:
        """
        Upload and process a reference image.
        
        Args:
            file: Uploaded image file
            user_id: User who uploaded the image
            video_id: Associated video (optional)
            usage_type: How the image will be used
            description: User's description of the image
            
        Returns:
            ReferenceImageResponse with upload details
        """
        try:
            # Validate file
            await self._validate_file(file)
            
            # Generate unique ID and file path
            image_id = str(uuid.uuid4())
            file_extension = self._get_file_extension(file.filename)
            firebase_path = f"reference/{user_id}/{image_id}{file_extension}"
            
            # Upload to Firebase
            firebase_url = await self._upload_to_firebase(file, firebase_path)
            
            # Extract metadata
            file.file.seek(0)  # Reset file pointer
            metadata = await self._extract_metadata(file.file, description)
            
            # Generate embedding for search (if Gemini available)
            embedding = await self._generate_embedding(firebase_url, metadata)
            
            # Store in database (Supabase)
            reference = await self._store_in_database(
                id=image_id,
                user_id=user_id,
                video_id=video_id,
                firebase_url=firebase_url,
                usage_type=usage_type,
                metadata=metadata,
                embedding=embedding
            )
            
            logger.info("Reference image uploaded successfully", 
                       image_id=image_id, user_id=user_id, usage_type=usage_type)
            
            return ReferenceImageResponse(
                id=reference.id,
                firebase_url=reference.firebase_url,
                usage_type=reference.usage_type,
                metadata=reference.metadata,
                created_at=reference.created_at,
                expires_at=reference.expires_at,
                is_starred=reference.is_starred
            )
            
        except Exception as e:
            logger.error("Failed to upload reference image", error=str(e))
            raise
    
    async def get_reference_image(self, reference_id: str) -> ReferenceImage:
        """Get reference image by ID."""
        # Implementation would query Supabase
        # For now, return placeholder
        raise NotImplementedError("Database integration required")
    
    async def list_user_references(
        self, 
        user_id: str, 
        video_id: Optional[str] = None,
        usage_type: Optional[str] = None,
        limit: int = 50
    ) -> List[ReferenceImage]:
        """List user's reference images."""
        # Implementation would query Supabase with filters
        # For now, return empty list
        return []
    
    async def delete_reference_image(self, reference_id: str, user_id: str) -> bool:
        """Delete reference image and cleanup storage."""
        try:
            # Get reference from database
            reference = await self.get_reference_image(reference_id)
            
            # Verify ownership
            if reference.user_id != user_id:
                raise PermissionError("Not authorized to delete this reference")
            
            # Delete from Firebase Storage
            await self._delete_from_firebase(reference.firebase_url)
            
            # Delete from database
            await self._delete_from_database(reference_id)
            
            logger.info("Reference image deleted", reference_id=reference_id, user_id=user_id)
            return True
            
        except Exception as e:
            logger.error("Failed to delete reference image", reference_id=reference_id, error=str(e))
            raise
    
    async def get_similar_references(
        self, 
        embedding: List[float], 
        user_id: Optional[str] = None,
        threshold: float = 0.7, 
        limit: int = 5
    ) -> List[ReferenceImage]:
        """Find similar reference images using vector search."""
        # Implementation would use pgvector similarity search
        # For now, return empty list
        return []
    
    async def update_usage_stats(self, reference_id: str):
        """Update usage statistics for a reference image."""
        # Implementation would increment times_used and update last_used_at
        pass
    
    async def cleanup_expired_references(self):
        """Remove expired and unstarred reference images."""
        # Implementation would clean up expired references
        logger.info("Cleaning up expired reference images")
        pass
    
    # =========================================================================
    # Private Methods
    # =========================================================================
    async def _validate_file(self, file: UploadFile):
        """Validate uploaded file."""
        # Check file size
        if file.size and file.size > self.max_file_size:
            raise ValueError(f"File too large. Maximum size is {self.max_file_size // (1024*1024)}MB")
        
        # Check file format
        if file.content_type:
            if not file.content_type.startswith('image/'):
                raise ValueError("File must be an image")
            
            format_name = file.content_type.split('/')[-1].upper()
            if format_name not in self.supported_formats:
                raise ValueError(f"Unsupported format: {format_name}")
    
    def _get_file_extension(self, filename: str) -> str:
        """Get file extension from filename."""
        if not filename:
            return ".jpg"  # Default
        
        match = re.search(r'\.([^.]+)$', filename)
        return f".{match.group(1).lower()}" if match else ".jpg"
    
    async def _upload_to_firebase(self, file: UploadFile, path: str) -> str:
        """Upload file to Firebase Storage."""
        # Implementation would use Google Cloud Storage client
        # For now, simulate Firebase URL
        bucket_name = self.firebase_bucket_name
        return f"gs://{bucket_name}/{path}"
    
    async def _delete_from_firebase(self, firebase_url: str):
        """Delete file from Firebase Storage."""
        # Implementation would delete from Firebase
        logger.info("Deleting from Firebase", url=firebase_url)
        pass
    
    async def _extract_metadata(self, file_content, description: Optional[str]) -> Dict[str, Any]:
        """Extract metadata from image file."""
        try:
            # Reset file pointer
            file_content.seek(0)
            
            # Open and analyze image
            with Image.open(file_content) as img:
                metadata = {
                    "width": img.width,
                    "height": img.height,
                    "format": img.format,
                    "mode": img.mode,
                    "description": description or "",
                    "file_size": len(file_content.getvalue()) if hasattr(file_content, 'getvalue') else 0,
                    "extracted_at": datetime.utcnow().isoformat()
                }
                
                # Calculate basic image properties
                metadata["aspect_ratio"] = round(img.width / img.height, 2) if img.height > 0 else 1.0
                metadata["is_landscape"] = img.width > img.height
                metadata["is_portrait"] = img.height > img.width
                metadata["is_square"] = img.width == img.height
                
                # Basic color analysis (could be enhanced)
                if img.mode in ("RGB", "RGBA"):
                    # Sample pixels for basic color analysis
                    pixels = img.resize((100, 100))
                    pixel_values = list(pixels.getdata())
                    
                    # Simple average color calculation
                    if pixel_values:
                        avg_color = tuple(sum(c[i] for c in pixel_values) // len(pixel_values) 
                                        for i in range(min(3, len(pixel_values[0]))))
                        metadata["average_color"] = f"rgb({avg_color[0]},{avg_color[1]},{avg_color[2]})"
                
                return metadata
                
        except Exception as e:
            logger.error("Failed to extract image metadata", error=str(e))
            return {
                "description": description or "",
                "extracted_at": datetime.utcnow().isoformat(),
                "error": str(e)
            }
    
    async def _generate_embedding(self, image_url: str, metadata: Dict[str, Any]) -> Optional[List[float]]:
        """Generate embedding for semantic search."""
        try:
            # Implementation would use Gemini embeddings API
            # For now, return None (embedding generation disabled)
            logger.info("Embedding generation not implemented yet")
            return None
            
        except Exception as e:
            logger.error("Failed to generate embedding", error=str(e))
            return None
    
    async def _store_in_database(
        self,
        id: str,
        user_id: str,
        video_id: Optional[str],
        firebase_url: str,
        usage_type: str,
        metadata: Dict[str, Any],
        embedding: Optional[List[float]]
    ) -> ReferenceImage:
        """Store reference image metadata in database."""
        # Implementation would store in Supabase
        # For now, return mock ReferenceImage
        return ReferenceImage(
            id=id,
            user_id=user_id,
            video_id=video_id,
            firebase_url=firebase_url,
            usage_type=usage_type,
            metadata=metadata,
            embedding=embedding
        )
    
    async def _delete_from_database(self, reference_id: str):
        """Delete reference from database."""
        # Implementation would delete from Supabase
        logger.info("Deleting from database", reference_id=reference_id)
        pass


# Global reference image service instance
reference_image_service = ReferenceImageService()
