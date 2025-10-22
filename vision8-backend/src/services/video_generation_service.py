"""
Video Generation Service for Vision8 Backend

This service handles AI-powered video generation using Veo-3 and other models.
It provides scene replacement, video stitching, and generation management.
"""

import os
import json
import asyncio
import tempfile
import shutil
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
import aiohttp
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

logger = structlog.get_logger()

class VideoGenerationService:
    """Service for AI-powered video generation and scene replacement."""
    
    def __init__(self):
        self.veo_api_key = os.getenv('VEO_API_KEY')
        self.veo_api_url = os.getenv('VEO_API_URL', 'https://aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/veo-3-fast:generateVideo')
        self.project_id = os.getenv('GOOGLE_CLOUD_PROJECT')
        self.location = os.getenv('VEO_LOCATION', 'us-central1')
        
        # Generation settings
        self.supported_models = ['veo3', 'sora2']
        self.quality_presets = {
            'draft': {'resolution': '480p', 'fps': 24, 'duration_limit': 30},
            'standard': {'resolution': '720p', 'fps': 30, 'duration_limit': 60},
            'high': {'resolution': '1080p', 'fps': 30, 'duration_limit': 120}
        }
        
    async def generate_scene_replacement(
        self,
        video_id: str,
        scene_id: str,
        generation_prompt: str,
        model: str = 'veo3',
        quality: str = 'standard',
        duration_seconds: float = 5.0,
        reference_frame: Optional[str] = None,
        style_settings: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Generate a replacement scene using AI video generation.
        
        Args:
            video_id: Source video identifier
            scene_id: Scene to replace identifier
            generation_prompt: Text prompt for generation
            model: AI model to use ('veo3' or 'sora2')
            quality: Quality preset ('draft', 'standard', 'high')
            duration_seconds: Duration of generated scene
            reference_frame: Base64 encoded reference frame (optional)
            style_settings: Additional style parameters
            
        Returns:
            Dict containing generation job details and status
        """
        try:
            logger.info("Starting scene generation",
                       video_id=video_id,
                       scene_id=scene_id,
                       model=model,
                       duration=duration_seconds)
            
            # Validate inputs
            if model not in self.supported_models:
                raise ValueError(f"Unsupported model: {model}. Supported: {self.supported_models}")
                
            if quality not in self.quality_presets:
                raise ValueError(f"Unsupported quality: {quality}. Supported: {list(self.quality_presets.keys())}")
            
            # Create generation job
            job_id = f"{video_id}_{scene_id}_{model}_{int(asyncio.get_event_loop().time())}"
            
            # Prepare generation request based on model
            if model == 'veo3':
                result = await self._generate_with_veo3(
                    job_id=job_id,
                    prompt=generation_prompt,
                    duration=duration_seconds,
                    quality=quality,
                    reference_frame=reference_frame,
                    style_settings=style_settings
                )
            elif model == 'sora2':
                result = await self._generate_with_sora2(
                    job_id=job_id,
                    prompt=generation_prompt,
                    duration=duration_seconds,
                    quality=quality,
                    reference_frame=reference_frame,
                    style_settings=style_settings
                )
            else:
                raise ValueError(f"Model {model} not implemented")
            
            # Store generation metadata
            generation_metadata = {
                'job_id': job_id,
                'video_id': video_id,
                'scene_id': scene_id,
                'model': model,
                'prompt': generation_prompt,
                'duration': duration_seconds,
                'quality': quality,
                'status': result.get('status', 'pending'),
                'created_at': asyncio.get_event_loop().time(),
                'generation_url': result.get('generation_url'),
                'estimated_completion': result.get('estimated_completion')
            }
            
            logger.info("Scene generation initiated",
                       job_id=job_id,
                       status=result.get('status'))
            
            return generation_metadata
            
        except Exception as e:
            logger.error("Scene generation failed",
                        video_id=video_id,
                        scene_id=scene_id,
                        error=str(e),
                        exc_info=True)
            raise
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _generate_with_veo3(
        self,
        job_id: str,
        prompt: str,
        duration: float,
        quality: str,
        reference_frame: Optional[str] = None,
        style_settings: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Generate video using Veo-3 model."""
        
        if not self.veo_api_key or not self.project_id:
            # Mock response for development/testing
            logger.warning("Veo-3 API not configured, returning mock response")
            return {
                'status': 'completed',
                'generation_url': f'https://mock-storage.com/generated/{job_id}.mp4',
                'estimated_completion': asyncio.get_event_loop().time() + 30
            }
        
        try:
            # Prepare Veo-3 API request
            api_url = self.veo_api_url.format(
                project=self.project_id,
                location=self.location
            )
            
            preset = self.quality_presets[quality]
            
            request_payload = {
                'instances': [{
                    'prompt': prompt,
                    'duration_seconds': min(duration, preset['duration_limit']),
                    'resolution': preset['resolution'],
                    'fps': preset['fps'],
                    'style': style_settings or {},
                    'reference_image': reference_frame if reference_frame else None
                }],
                'parameters': {
                    'job_id': job_id,
                    'quality_preset': quality
                }
            }
            
            headers = {
                'Authorization': f'Bearer {self.veo_api_key}',
                'Content-Type': 'application/json'
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(api_url, json=request_payload, headers=headers) as response:
                    if response.status == 200:
                        result = await response.json()
                        
                        return {
                            'status': 'processing',
                            'generation_url': result.get('generation_url'),
                            'estimated_completion': asyncio.get_event_loop().time() + result.get('estimated_seconds', 60)
                        }
                    else:
                        error_text = await response.text()
                        raise Exception(f"Veo-3 API error: {response.status} - {error_text}")
                        
        except Exception as e:
            logger.error("Veo-3 generation failed", job_id=job_id, error=str(e))
            raise
    
    async def _generate_with_sora2(
        self,
        job_id: str,
        prompt: str,
        duration: float,
        quality: str,
        reference_frame: Optional[str] = None,
        style_settings: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Generate video using Sora-2 model (placeholder implementation)."""
        
        logger.warning("Sora-2 integration not yet implemented, using mock response")
        
        # Mock Sora-2 response
        return {
            'status': 'completed',
            'generation_url': f'https://mock-storage.com/sora2/{job_id}.mp4',
            'estimated_completion': asyncio.get_event_loop().time() + 45
        }
    
    async def get_generation_status(self, job_id: str) -> Dict[str, Any]:
        """Get the status of a generation job."""
        try:
            # In a real implementation, this would query the generation service
            # For now, return mock status
            
            logger.info("Checking generation status", job_id=job_id)
            
            # Mock status response
            return {
                'job_id': job_id,
                'status': 'completed',  # or 'processing', 'failed'
                'progress': 100,
                'generation_url': f'https://mock-storage.com/generated/{job_id}.mp4',
                'thumbnail_url': f'https://mock-storage.com/thumbnails/{job_id}.jpg',
                'duration': 5.0,
                'file_size': 1024 * 1024 * 2,  # 2MB
                'completed_at': asyncio.get_event_loop().time()
            }
            
        except Exception as e:
            logger.error("Failed to get generation status", job_id=job_id, error=str(e))
            raise
    
    async def list_generations(self, video_id: str) -> List[Dict[str, Any]]:
        """List all generations for a video."""
        try:
            logger.info("Listing generations", video_id=video_id)
            
            # Mock response - in real implementation, query database
            return [
                {
                    'job_id': f'{video_id}_scene_001_veo3_123456',
                    'scene_id': 'scene_001',
                    'model': 'veo3',
                    'status': 'completed',
                    'created_at': asyncio.get_event_loop().time() - 3600,
                    'generation_url': f'https://mock-storage.com/generated/{video_id}_scene_001.mp4'
                }
            ]
            
        except Exception as e:
            logger.error("Failed to list generations", video_id=video_id, error=str(e))
            raise
    
    async def delete_generation(self, job_id: str) -> bool:
        """Delete a generation job and its files."""
        try:
            logger.info("Deleting generation", job_id=job_id)
            
            # In real implementation:
            # 1. Delete from cloud storage
            # 2. Remove from database
            # 3. Cancel if still processing
            
            return True
            
        except Exception as e:
            logger.error("Failed to delete generation", job_id=job_id, error=str(e))
            return False
    
    async def stitch_video_with_generated_scene(
        self,
        original_video_path: str,
        generated_scene_path: str,
        scene_start_time: float,
        scene_end_time: float,
        output_path: str
    ) -> str:
        """
        Stitch original video with generated scene replacement.
        
        Args:
            original_video_path: Path to original video
            generated_scene_path: Path to generated scene
            scene_start_time: Start time of scene to replace (seconds)
            scene_end_time: End time of scene to replace (seconds)
            output_path: Path for output video
            
        Returns:
            Path to stitched video
        """
        try:
            import ffmpeg
            
            logger.info("Starting video stitching",
                       original_video=original_video_path,
                       generated_scene=generated_scene_path,
                       start_time=scene_start_time,
                       end_time=scene_end_time)
            
            # Create temporary directory for segments
            temp_dir = Path(tempfile.mkdtemp())
            
            try:
                # 1. Extract pre-scene segment (0 to scene_start_time)
                pre_scene_path = temp_dir / "pre_scene.mp4"
                if scene_start_time > 0:
                    (
                        ffmpeg
                        .input(original_video_path, ss=0, t=scene_start_time)
                        .output(str(pre_scene_path), vcodec='libx264', acodec='aac')
                        .overwrite_output()
                        .run(quiet=True)
                    )
                    logger.info("Pre-scene segment extracted", duration=scene_start_time)
                
                # 2. Get original video duration for post-scene extraction
                probe = ffmpeg.probe(original_video_path)
                video_duration = float(probe['streams'][0]['duration'])
                
                # 3. Extract post-scene segment (scene_end_time to end)
                post_scene_path = temp_dir / "post_scene.mp4"
                if scene_end_time < video_duration:
                    post_duration = video_duration - scene_end_time
                    (
                        ffmpeg
                        .input(original_video_path, ss=scene_end_time, t=post_duration)
                        .output(str(post_scene_path), vcodec='libx264', acodec='aac')
                        .overwrite_output()
                        .run(quiet=True)
                    )
                    logger.info("Post-scene segment extracted", duration=post_duration)
                
                # 4. Create concat file list
                concat_file = temp_dir / "concat_list.txt"
                segments = []
                
                if scene_start_time > 0:
                    segments.append(f"file '{pre_scene_path}'")
                
                segments.append(f"file '{generated_scene_path}'")
                
                if scene_end_time < video_duration:
                    segments.append(f"file '{post_scene_path}'")
                
                with open(concat_file, 'w') as f:
                    f.write('\n'.join(segments))
                
                # 5. Concatenate all segments
                (
                    ffmpeg
                    .input(str(concat_file), format='concat', safe=0)
                    .output(
                        output_path,
                        vcodec='libx264',
                        acodec='aac',
                        **{'c:v': 'libx264', 'c:a': 'aac', 'preset': 'medium', 'crf': '23'}
                    )
                    .overwrite_output()
                    .run(quiet=True)
                )
                
                logger.info("Video stitching completed successfully", 
                           output_path=output_path,
                           segments_count=len(segments))
                
                # Create download links
                job_id = Path(output_path).stem  # Use filename as job_id
                download_links = await self.create_download_link(job_id, output_path)
                
                return {
                    'local_path': output_path,
                    'download_links': download_links
                }
                
            finally:
                # Cleanup temporary files
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
                logger.info("Temporary files cleaned up")
            
        except Exception as e:
            logger.error("Video stitching failed", error=str(e), exc_info=True)
            raise
    
    def get_supported_models(self) -> List[str]:
        """Get list of supported generation models."""
        return self.supported_models.copy()
    
    def get_quality_presets(self) -> Dict[str, Dict]:
        """Get available quality presets."""
        return self.quality_presets.copy()
    
    async def upload_to_cloud_storage(self, local_path: str, cloud_filename: str) -> str:
        """Upload video to cloud storage and return public URL."""
        try:
            from google.cloud import storage
            
            # Initialize Google Cloud Storage client
            client = storage.Client(project=self.project_id)
            bucket_name = os.getenv('CLOUD_STORAGE_BUCKET', 'vision8-generated-videos')
            bucket = client.bucket(bucket_name)
            
            # Upload file
            blob = bucket.blob(f"generated/{cloud_filename}")
            blob.upload_from_filename(local_path)
            
            # Make blob publicly accessible
            blob.make_public()
            
            public_url = blob.public_url
            logger.info("Video uploaded to cloud storage", 
                       local_path=local_path,
                       cloud_url=public_url)
            
            return public_url
            
        except Exception as e:
            logger.error("Failed to upload to cloud storage", error=str(e))
            # Return local path as fallback
            return local_path
    
    async def create_download_link(self, job_id: str, video_path: str) -> Dict[str, str]:
        """Create download and streaming links for a generated video."""
        try:
            # Upload to cloud storage
            cloud_filename = f"{job_id}.mp4"
            cloud_url = await self.upload_to_cloud_storage(video_path, cloud_filename)
            
            # Create API endpoints for download and streaming
            base_url = os.getenv('API_BASE_URL', 'http://localhost:8000')
            
            return {
                'download_url': f"{base_url}/api/v1/video/generation/download/{job_id}",
                'stream_url': f"{base_url}/api/v1/video/generation/stream/{job_id}",
                'cloud_url': cloud_url,
                'filename': cloud_filename
            }
            
        except Exception as e:
            logger.error("Failed to create download links", job_id=job_id, error=str(e))
            raise
    
    async def get_video_info(self, video_path: str) -> Dict[str, Any]:
        """Get video information using FFmpeg probe."""
        try:
            import ffmpeg
            
            probe = ffmpeg.probe(video_path)
            video_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'video'), None)
            audio_stream = next((stream for stream in probe['streams'] if stream['codec_type'] == 'audio'), None)
            
            return {
                'duration': float(probe['format']['duration']),
                'size': int(probe['format']['size']),
                'video': {
                    'width': int(video_stream['width']) if video_stream else None,
                    'height': int(video_stream['height']) if video_stream else None,
                    'fps': eval(video_stream['r_frame_rate']) if video_stream else None,
                    'codec': video_stream['codec_name'] if video_stream else None
                },
                'audio': {
                    'codec': audio_stream['codec_name'] if audio_stream else None,
                    'sample_rate': int(audio_stream['sample_rate']) if audio_stream else None,
                    'channels': int(audio_stream['channels']) if audio_stream else None
                }
            }
            
        except Exception as e:
            logger.error("Failed to get video info", video_path=video_path, error=str(e))
            raise
    
    async def extract_thumbnail(self, video_path: str, timestamp: float, output_path: str) -> str:
        """Extract thumbnail from video at specific timestamp."""
        try:
            import ffmpeg
            
            (
                ffmpeg
                .input(video_path, ss=timestamp)
                .output(output_path, vframes=1, format='image2', vcodec='mjpeg')
                .overwrite_output()
                .run(quiet=True)
            )
            
            logger.info("Thumbnail extracted", 
                       video_path=video_path, 
                       timestamp=timestamp, 
                       output_path=output_path)
            
            return output_path
            
        except Exception as e:
            logger.error("Failed to extract thumbnail", error=str(e))
            raise
    
    async def validate_video_compatibility(self, video1_path: str, video2_path: str) -> bool:
        """Check if two videos are compatible for stitching."""
        try:
            info1 = await self.get_video_info(video1_path)
            info2 = await self.get_video_info(video2_path)
            
            # Check resolution compatibility
            if (info1['video']['width'] != info2['video']['width'] or 
                info1['video']['height'] != info2['video']['height']):
                logger.warning("Video resolution mismatch", 
                             video1=f"{info1['video']['width']}x{info1['video']['height']}",
                             video2=f"{info2['video']['width']}x{info2['video']['height']}")
                return False
            
            # Check codec compatibility
            if info1['video']['codec'] != info2['video']['codec']:
                logger.info("Video codec mismatch - will re-encode during stitching",
                           video1_codec=info1['video']['codec'],
                           video2_codec=info2['video']['codec'])
            
            return True
            
        except Exception as e:
            logger.error("Failed to validate video compatibility", error=str(e))
            return False


# Global service instance
video_generation_service = VideoGenerationService()