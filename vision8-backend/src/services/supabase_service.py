"""
Supabase Service for Video Search and Storage

This module provides video search functionality using Supabase PostgreSQL
with pgvector for semantic search capabilities.
"""

from typing import Dict, List, Optional, Any
import os
import structlog
from supabase import create_client, Client
from datetime import datetime
import numpy as np

logger = structlog.get_logger()

class SupabaseService:
    def __init__(self):
        """Initialize Supabase client"""
        supabase_url = os.getenv('SUPABASE_URL')
        supabase_key = os.getenv('SUPABASE_ANON_KEY')

        if not supabase_url or not supabase_key:
            logger.warning("Supabase credentials not configured - video search will be disabled")
            self.client = None
            return

        try:
            self.client: Client = create_client(supabase_url, supabase_key)
            logger.info("Supabase client initialized successfully")
        except Exception as e:
            logger.error("Failed to initialize Supabase client", error=str(e))
            self.client = None

    async def store_video_scene(self, scene_data: Dict[str, Any]) -> bool:
        """
        Store a video scene in Supabase with embeddings

        Args:
            scene_data: Scene data including embeddings and metadata

        Returns:
            bool: True if successful
        """
        if not self.client:
            logger.warning("Supabase client not available - skipping scene storage")
            return False

        try:
            # Prepare data for Supabase
            record = {
                "video_id": scene_data["video_id"],
                "scene_id": scene_data["scene_id"],
                "start_time_ms": scene_data["start_time_ms"],
                "end_time_ms": scene_data["end_time_ms"],
                "scene_summary": scene_data["scene_summary"],
                "full_description": scene_data["full_description"],
                "scene_embedding": scene_data["scene_embedding"],
                "transcript_phrases": scene_data.get("transcript_phrases", []),
                "objects_tracked": scene_data.get("objects_tracked", []),
                "actions_detected": scene_data.get("actions_detected", []),
                "accurate_transcript": scene_data.get("accurate_transcript"),
                "created_at": datetime.utcnow().isoformat()
            }

            # Insert into Supabase
            response = self.client.table('video_scenes').insert(record).execute()

            logger.info("Video scene stored in Supabase",
                       scene_id=scene_data["scene_id"],
                       video_id=scene_data["video_id"])

            return True

        except Exception as e:
            logger.error("Failed to store video scene in Supabase",
                        scene_id=scene_data.get("scene_id"),
                        error=str(e))
            return False

    async def search_video_content(
        self,
        query_embedding: List[float],
        video_id: Optional[str] = None,
        limit: int = 20,
        similarity_threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Search video content using vector similarity

        Args:
            query_embedding: Query embedding vector
            video_id: Optional filter by specific video
            limit: Maximum results to return
            similarity_threshold: Minimum similarity score

        Returns:
            List of matching scenes with similarity scores
        """
        if not self.client:
            logger.warning("Supabase client not available - returning empty search results")
            return []

        try:
            # Build the query
            query = self.client.table('video_scenes').select('*')

            # Add video filter if specified
            if video_id:
                query = query.eq('video_id', video_id)

            # Vector similarity search using pgvector
            # Note: This requires the pgvector extension to be enabled in Supabase
            embedding_str = f'[{",".join(map(str, query_embedding))}]'

            # Use RPC function for vector search (we'll create this in Supabase)
            response = self.client.rpc('search_video_scenes', {
                'query_embedding': query_embedding,
                'match_threshold': similarity_threshold,
                'match_count': limit,
                'video_filter': video_id
            }).execute()

            results = []
            for record in response.data:
                # Calculate similarity score (cosine similarity)
                scene_embedding = record['scene_embedding']
                if scene_embedding:
                    similarity = self._cosine_similarity(query_embedding, scene_embedding)
                    if similarity >= similarity_threshold:
                        result = {
                            "scene_id": record["scene_id"],
                            "video_id": record["video_id"],
                            "time_ms": record["start_time_ms"],
                            "end_time_ms": record["end_time_ms"],
                            "summary": record["scene_summary"],
                            "description": record["full_description"],
                            "score": float(similarity),
                            "transcript": record.get("transcript_phrases", []),
                            "objects": record.get("objects_tracked", []),
                            "actions": record.get("actions_detected", []),
                            "accurate_transcript": record.get("accurate_transcript")
                        }
                        results.append(result)

            # Sort by similarity score
            results.sort(key=lambda x: x["score"], reverse=True)
            results = results[:limit]

            logger.info("Video search completed",
                       query_results=len(results),
                       video_filter=video_id)

            return results

        except Exception as e:
            logger.error("Video search failed", error=str(e))
            return []

    async def get_video_scenes(self, video_id: str) -> List[Dict[str, Any]]:
        """
        Get all scenes for a specific video

        Args:
            video_id: The video ID to get scenes for

        Returns:
            List of scenes for the video
        """
        if not self.client:
            return []

        try:
            response = self.client.table('video_scenes') \
                .select('*') \
                .eq('video_id', video_id) \
                .order('start_time_ms') \
                .execute()

            scenes = []
            for record in response.data:
                scenes.append({
                    "scene_id": record["scene_id"],
                    "start_time_ms": record["start_time_ms"],
                    "end_time_ms": record["end_time_ms"],
                    "scene_summary": record["scene_summary"],
                    "full_description": record["full_description"],
                    "transcript_phrases": record.get("transcript_phrases", []),
                    "objects_tracked": record.get("objects_tracked", []),
                    "actions_detected": record.get("actions_detected", []),
                    "accurate_transcript": record.get("accurate_transcript")
                })

            return scenes

        except Exception as e:
            logger.error("Failed to get video scenes", video_id=video_id, error=str(e))
            return []

    async def delete_video_scenes(self, video_id: str) -> bool:
        """
        Delete all scenes for a specific video

        Args:
            video_id: The video ID to delete scenes for

        Returns:
            bool: True if successful
        """
        if not self.client:
            return False

        try:
            response = self.client.table('video_scenes') \
                .delete() \
                .eq('video_id', video_id) \
                .execute()

            deleted_count = len(response.data) if response.data else 0
            logger.info("Video scenes deleted from Supabase",
                       video_id=video_id,
                       deleted_count=deleted_count)

            return True

        except Exception as e:
            logger.error("Failed to delete video scenes",
                        video_id=video_id,
                        error=str(e))
            return False

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """
        Calculate cosine similarity between two vectors

        Args:
            vec1: First vector
            vec2: Second vector

        Returns:
            Cosine similarity score (0-1)
        """
        try:
            v1 = np.array(vec1)
            v2 = np.array(vec2)

            dot_product = np.dot(v1, v2)
            norm_v1 = np.linalg.norm(v1)
            norm_v2 = np.linalg.norm(v2)

            if norm_v1 == 0 or norm_v2 == 0:
                return 0.0

            return dot_product / (norm_v1 * norm_v2)
        except Exception:
            return 0.0

    def is_available(self) -> bool:
        """Check if Supabase service is available"""
        return self.client is not None

    async def create_video_record(self, video_data: Dict[str, Any]) -> str:
        """Create a new video record"""
        if not self.client: return None
        try:
            response = self.client.table('videos').insert(video_data).execute()
            return response.data[0]['id'] if response.data else None
        except Exception as e:
            logger.error("Failed to create video record", error=str(e))
            return None

    async def update_video_by_upload_id(self, upload_id: str, updates: Dict[str, Any]) -> bool:
        """Update video record by upload_id (used during upload processing)"""
        if not self.client: return False
        try:
            self.client.table('videos').update(updates).eq('upload_id', upload_id).execute()
            logger.info("Updated video by upload_id", upload_id=upload_id)
            return True
        except Exception as e:
            logger.error("Failed to update video by upload_id", upload_id=upload_id, error=str(e))
            return False

    async def update_video_by_asset_id(self, asset_id: str, updates: Dict[str, Any]) -> bool:
        """Update video record by mux_asset_id"""
        if not self.client: return False
        try:
            self.client.table('videos').update(updates).eq('mux_asset_id', asset_id).execute()
            logger.info("Updated video by asset_id", asset_id=asset_id)
            return True
        except Exception as e:
            logger.error("Failed to update video by asset_id", asset_id=asset_id, error=str(e))
            return False

    async def get_video(self, video_id: str) -> Optional[Dict[str, Any]]:
        """Get video record by ID - handles both UUID and string IDs"""
        if not self.client: return None
        try:
            # First try to find by UUID (if it looks like a UUID)
            import uuid
            try:
                uuid.UUID(video_id)  # Test if it's a valid UUID
                response = self.client.table('videos').select('*').eq('id', video_id).execute()
                if response.data:
                    return response.data[0]
            except (ValueError, TypeError):
                # Not a UUID, continue to other methods
                pass
            
            # Try to find by mux_asset_id (common for uploaded videos)
            response = self.client.table('videos').select('*').eq('mux_asset_id', video_id).execute()
            if response.data:
                return response.data[0]
            
            # Try to find by upload_id (for videos in upload process)
            response = self.client.table('videos').select('*').eq('upload_id', video_id).execute()
            if response.data:
                return response.data[0]
            
            # If no video record found, return None (this is normal for test videos)
            logger.info("Video record not found", video_id=video_id)
            return None
            
        except Exception as e:
            logger.error("Failed to get video", video_id=video_id, error=str(e))
            return None