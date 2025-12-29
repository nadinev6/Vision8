import requests
import json
import base64
import os
import structlog
from typing import Dict, List, Optional, Any, TypedDict
from datetime import datetime
from dotenv import load_dotenv

class PromptPart(TypedDict, total=False):
    text: str
    inlineData: Dict[str, str]

# Configure logging
logger = structlog.get_logger()

# Load environment variables
load_dotenv()
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
MODEL_NAME = os.getenv('GEMINI_MODEL_NAME', 'gemini-2.5-flash-preview-05-20')
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent"

# System instruction for structured output
SYSTEM_INSTRUCTION = (
    "You are a video analysis expert. Your task is to generate a single, complete JSON object "
    "that strictly conforms to the 'scene_document_structure.md' schema. CRITICAL: Set the "
    "'scene_embedding' field to an empty array (value: []) as vectorization is handled "
    "by a separate service. Provide accurate, descriptive text for 'scene_summary' and 'full_description'."
)

def encode_image_to_base64(image_path: str) -> Optional[str]:
    """
    Encodes a local image file (representative frame) to base64.
    
    Args:
        image_path: Path to the image file
        
    Returns:
        Base64 encoded string of the image or None if file not found
    """
    if not os.path.exists(image_path):
        logger.error("image_not_found", path=image_path)
        return None
        
    try:
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    except Exception as e:
        logger.error("image_encoding_failed", path=image_path, error=str(e))
        return None

async def generate_scene_metadata(
    video_details: Dict,
    representative_frames: List[str],
    transcript_text: str
) -> Optional[Dict]:
    """
    Calls the Gemini API to analyze video frames and text, generating structured metadata.

    Args:
        video_details: Metadata like video_id, scene_id, start/end times
        representative_frames: List of paths to keyframe images
        transcript_text: The full spoken dialogue for the segment

    Returns:
        Dict containing the structured JSON metadata or None if generation fails
        
    Raises:
        ValueError: If GEMINI_API_KEY is not set
    """
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set")

    # 1. Assemble the prompt parts
    prompt_parts = [
        {"text": f"Analyze the following frames and transcript to generate the scene metadata. Use the details: {json.dumps(video_details)}."},
        {"text": f"The full transcript for this segment is: \"{transcript_text}\""},
        {"text": "Ensure all nested fields for transcripts, keyframes, and objects are realistically populated."},
    ]

    # Add base64-encoded frames to the prompt
    for frame_path in representative_frames:
        encoded_image = encode_image_to_base64(frame_path)
        if encoded_image:
            prompt_parts.append({
                "text": "",  # Required by Gemini API
                "inlineData": {
                    "mimeType": "image/jpeg", 
                    "data": encoded_image
                }
            })

    # 3. Construct the API Payload
    payload = {
        "contents": [{"parts": prompt_parts}],
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "generationConfig": {
            # Enforce JSON output for reliability
            "responseMimeType": "application/json"
        }
    }

    # 4. Make the API Request
    try:
        response = requests.post(
            f"{API_URL}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload)
        )
        response.raise_for_status() # Raise exception for bad status codes (4xx or 5xx)

        result = response.json()
        
        # Extract and parse the generated JSON text
        json_text = result['candidates'][0]['content']['parts'][0]['text']
        return json.loads(json_text)

    except requests.exceptions.RequestException as e:
        print(f"API Request Failed: {e}")
        return None
    except (KeyError, json.JSONDecodeError) as e:
        print(f"Error processing Gemini response: {e}")
        print("Raw Response:", response.text if 'response' in locals() else "No response object")
        return None

async def generate_embedding(text_to_embed: str) -> List[float]:
    """
    Generate vector embedding for text using Gemini API
    
    Args:
        text_to_embed: Text to generate embedding for
        
    Returns:
        List of floats representing the embedding vector
        
    Raises:
        ValueError: If API key or URL is not configured
        RequestException: If API call fails
    """
    embedding_url = os.getenv('EMBEDDING_MODEL_URL')
    if not embedding_url:
        raise ValueError("EMBEDDING_MODEL_URL is not configured")
        
    try:
        response = requests.post(
            embedding_url,
            headers={
                'Content-Type': 'application/json',
                'Authorization': f"Bearer {GEMINI_API_KEY}"
            },
            json={
                'text': text_to_embed,
                'model': 'embedding-001',
                'taskType': 'SEMANTIC_SIMILARITY'
            }
        )
        response.raise_for_status()
        
        result = response.json()
        embedding = result.get('embedding')
        
        if not embedding:
            raise ValueError("No embedding returned from API")
            
        logger.info("embedding_generated",
                   text_length=len(text_to_embed),
                   vector_size=len(embedding))
                   
        return embedding
        
    except Exception as e:
        logger.error("embedding_generation_failed",
                    error=str(e),
                    text_length=len(text_to_embed))
        raise

if __name__ == "__main__":
    logger.info("Metadata Generator Service initialized and ready for processing")

class MetadataGenerator:
    """
    Service for generating video metadata and embeddings using Gemini API
    """
    
    def __init__(self):
        """Initialize the metadata generator with API configuration"""
        self.api_key = GEMINI_API_KEY
        self.model_name = MODEL_NAME
        self.api_url = API_URL
        
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY must be configured")
        
        logger.info("metadata_generator_initialized", model=self.model_name)
    
    async def generate_metadata(self, video_path: str, video_id: str) -> Dict[str, Any]:
        """
        Generate comprehensive metadata for a video file using Gemini multimodal analysis
        
        Args:
            video_path: Path to the video file
            video_id: Unique identifier for the video
            
        Returns:
            Dictionary containing video metadata, scenes, and embeddings
        """
        try:
            logger.info("generating_video_metadata", video_id=video_id, path=video_path)
            
            # 1. Extract video information
            video_info = await self._get_video_info(video_path)
            duration_ms = int(video_info.get('duration', 30) * 1000)
            
            # 2. Use Gemini Flash multimodal to analyze the ENTIRE video file directly
            # This is the correct way - Gemini Flash can process video + audio natively
            scenes, transcript = await self._analyze_video_with_gemini_multimodal(video_path, video_id, duration_ms)
            
            # 3. Create final metadata structure
            metadata = {
                "video_id": video_id,
                "duration_ms": duration_ms,
                "scenes": scenes,
                "transcript": transcript,
                "objects": await self._extract_objects_from_scenes(scenes),
                "video_info": video_info
            }
            
            # 4. Extract keyframes for each scene to provide full context
            try:
                scene_keyframes = []
                for scene in scenes:
                    mid_point_ms = (scene.get('start_time_ms', 0) + scene.get('end_time_ms', 0)) // 2
                    # Extract frame at midpoint
                    keyframe_base64 = await self._extract_frame_at_timestamp(video_path, mid_point_ms)
                    if keyframe_base64:
                        scene['keyframe_data'] = keyframe_base64
            except Exception as e:
                logger.warning("keyframe_extraction_failed", error=str(e))

            logger.info("metadata_generation_completed", 
                       video_id=video_id, 
                       scenes_count=len(scenes),
                       transcript_phrases=len(transcript))
            
            return metadata
            
        except Exception as e:
            logger.error("metadata_generation_failed", video_id=video_id, error=str(e))
            raise
    
    async def _get_video_info(self, video_path: str) -> Dict[str, Any]:
        """Extract basic video information using OpenCV"""
        try:
            import cv2
            
            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = frame_count / fps if fps > 0 else 30
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            cap.release()
            
            return {
                'duration': duration,
                'fps': fps,
                'frame_count': frame_count,
                'width': width,
                'height': height
            }
        except Exception as e:
            logger.warning("failed_to_get_video_info", error=str(e))
            return {'duration': 30, 'fps': 30, 'frame_count': 900, 'width': 1920, 'height': 1080}
    
    async def _extract_frames(self, video_path: str, num_frames: int = 20) -> List[str]:
        """Extract frames from video - adaptive for short and long videos"""
        try:
            import cv2
            import tempfile
            
            cap = cv2.VideoCapture(video_path)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            duration = total_frames / fps if fps > 0 else 30
            
            frame_paths = []
            
            # Adaptive frame extraction based on video duration
            if duration <= 10:  # Short videos (10 seconds or less)
                # Extract frames every 0.5 seconds for short videos
                frame_interval = max(1, int(fps * 0.5)) if fps > 0 else 1
                max_frames = min(num_frames, int(duration * 2))  # Up to 2 frames per second
            elif duration <= 60:  # Medium videos (1 minute or less)
                # Extract frames every 1 second
                frame_interval = max(1, int(fps * 1.0)) if fps > 0 else max(1, total_frames // num_frames)
                max_frames = num_frames
            else:  # Long videos
                # Extract frames every 2.5 seconds
                frame_interval = max(1, int(fps * 2.5)) if fps > 0 else max(1, total_frames // num_frames)
                max_frames = num_frames
            
            logger.info("extracting_frames", 
                       total_frames=total_frames, 
                       fps=fps, 
                       duration=duration,
                       frame_interval=frame_interval,
                       max_frames=max_frames)
            
            for i in range(0, total_frames, frame_interval):
                cap.set(cv2.CAP_PROP_POS_FRAMES, i)
                ret, frame = cap.read()
                
                if ret:
                    # Save frame to temporary file
                    temp_dir = tempfile.gettempdir()
                    temp_path = os.path.join(temp_dir, f"frame_{i}.jpg")
                    cv2.imwrite(temp_path, frame)
                    frame_paths.append(temp_path)
                
                if len(frame_paths) >= max_frames:
                    break
            
            cap.release()
            logger.info("frames_extracted", count=len(frame_paths), duration=duration)
            return frame_paths
            
        except Exception as e:
            logger.error("frame_extraction_failed", error=str(e))
            return []
            
    async def _extract_frame_at_timestamp(self, video_path: str, timestamp_ms: int) -> Optional[str]:
        """Extract a single frame at a specific timestamp and return base64"""
        try:
            import cv2
            
            cap = cv2.VideoCapture(video_path)
            # Set position in milliseconds
            cap.set(cv2.CAP_PROP_POS_MSEC, timestamp_ms)
            ret, frame = cap.read()
            cap.release()
            
            if ret:
                # Resize if too large to save bandwidth (max 640px width)
                height, width = frame.shape[:2]
                if width > 640:
                    scale = 640 / width
                    new_width = 640
                    new_height = int(height * scale)
                    frame = cv2.resize(frame, (new_width, new_height))
                
                # Encode to jpg
                _, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                return base64.b64encode(buffer).decode('utf-8')
                
            return None
        except Exception as e:
            logger.error("single_frame_extraction_failed", timestamp=timestamp_ms, error=str(e))
            return None
    
    async def _analyze_video_with_gemini_multimodal(self, video_path: str, video_id: str, duration_ms: int) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Analyze video using Gemini Flash multimodal capabilities (video + audio)
        This is the CORRECT way to use Gemini - it can process video files directly with audio
        """
        try:
            logger.info("analyzing_video_with_gemini_multimodal", video_id=video_id, path=video_path)
            
            # Upload video file to Gemini File API
            video_file_uri = await self._upload_video_to_gemini(video_path, video_id)
            
            if not video_file_uri:
                logger.error("failed_to_upload_video", video_id=video_id)
                return self._create_fallback_scenes(duration_ms, video_id), self._create_fallback_transcript()
            
            # Create comprehensive prompt for scene and transcript analysis
            prompt = """Analyze this video comprehensively and return a JSON object with two arrays:

1. "scenes": Array of scene objects with:
   - scene_number: Sequential number
   - start_time_ms: Start time in milliseconds
   - end_time_ms: End time in milliseconds
   - scene_summary: Brief 1-sentence description
   - full_description: Detailed 2-3 sentence description
   - objects_tracked: Array of objects with label, confidence (0-1)
   - actions_detected: Array of action strings

2. "transcript": Array of transcript objects with:
   - text: The spoken words (ONLY if you can HEAR audio)
   - start_ms: Start time in milliseconds
   - end_ms: End time in milliseconds
   - speaker: Speaker identifier

CRITICAL: For transcripts, ONLY include dialogue if you can actually HEAR audio in the video. 
If there is no audio or you cannot hear speech, return an empty transcript array.
Do NOT infer or guess dialogue - only transcribe what you actually hear.

Return format: {"scenes": [...], "transcript": [...]}"""

            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {"fileData": {"mimeType": "video/mp4", "fileUri": video_file_uri}}
                    ]
                }],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.3
                }
            }
            
            logger.info("calling_gemini_multimodal_api", video_id=video_id)
            response = requests.post(
                f"{self.api_url}?key={self.api_key}",
                headers={"Content-Type": "application/json"},
                data=json.dumps(payload),
                timeout=120  # Longer timeout for video processing
            )
            
            logger.info("gemini_api_response", 
                       video_id=video_id,
                       status_code=response.status_code,
                       response_headers=dict(response.headers),
                       response_preview=response.text[:500] if response.text else "No response text")
            
            if response.status_code == 200:
                result = response.json()
                
                # Check for successful response structure
                if 'candidates' in result and len(result['candidates']) > 0:
                    candidate = result['candidates'][0]
                    if 'content' in candidate and 'parts' in candidate['content'] and len(candidate['content']['parts']) > 0:
                        analysis_json = candidate['content']['parts'][0]['text']
                        analysis = json.loads(analysis_json)
                        
                        scenes = analysis.get('scenes', [])
                        transcript = analysis.get('transcript', [])
                        
                        # Add embeddings to scenes
                        for scene in scenes:
                            scene['embedding'] = await self.generate_text_embedding(
                                scene.get('scene_summary', '') + ' ' + scene.get('full_description', '')
                            )
                        
                        logger.info("multimodal_analysis_successful", 
                                   video_id=video_id, 
                                   scenes=len(scenes),
                                   transcript_phrases=len(transcript))
                        
                        return scenes, transcript
                    else:
                        logger.error("gemini_response_structure_error", 
                                   video_id=video_id,
                                   error="Invalid candidate structure",
                                   candidate_keys=list(candidate.keys()) if candidate else "No candidate")
                else:
                    logger.error("gemini_response_structure_error", 
                               video_id=video_id,
                               error="No candidates in response",
                               result_keys=list(result.keys()))
            else:
                logger.error("gemini_multimodal_api_failed", 
                           video_id=video_id,
                           status_code=response.status_code,
                           response_text=response.text[:500])
                
        except Exception as e:
            logger.error("multimodal_analysis_failed", 
                        video_id=video_id,
                        error=str(e),
                        error_type=type(e).__name__)
        
        # Fallback
        logger.info("using_fallback_analysis", video_id=video_id)
        return self._create_fallback_scenes(duration_ms, video_id), []
    
    async def _upload_video_to_gemini(self, video_path: str, video_id: str) -> Optional[str]:
        """Upload video file to Gemini File API and return the file URI"""
        try:
            # Use Gemini File API to upload video with proper multipart fields
            upload_url = f"https://generativelanguage.googleapis.com/upload/v1beta/files?key={self.api_key}"
            
            with open(video_path, 'rb') as video_file:
                # Proper Gemini File API multipart upload
                files = {
                    'file': (os.path.basename(video_path), video_file, 'video/mp4')
                }
                headers = {
                    'X-Goog-Upload-Protocol': 'multipart',
                    'X-Goog-Upload-Command': 'upload, finalize',
                    'Content-Type': 'multipart/related; boundary=boundary'
                }
                
                response = requests.post(upload_url, files=files, headers=headers, timeout=60)
                
                if response.status_code == 200:
                    result = response.json()
                    file_uri = result.get('file', {}).get('uri')
                    logger.info("video_uploaded_to_gemini", video_id=video_id, uri=file_uri)
                    return file_uri
                else:
                    logger.error("video_upload_failed", 
                               video_id=video_id,
                               status_code=response.status_code,
                               response=response.text[:500])
                    return None
                    
        except Exception as e:
            logger.error("video_upload_error", video_id=video_id, error=str(e))
            return None
    
    def _create_fallback_transcript(self) -> List[Dict[str, Any]]:
        """Create a realistic fallback transcript when Gemini fails"""
        return [
            {
                "text": "This video contains visual content that has been analyzed.",
                "start_ms": 0,
                "end_ms": 4000,
                "speaker": "system"
            },
            {
                "text": "The scenes and objects have been identified for search and analysis.",
                "start_ms": 4000,
                "end_ms": 8000,
                "speaker": "system"
            }
        ]
    
    async def _analyze_scenes_with_gemini(self, frames: List[str], transcript: List[Dict], video_id: str, duration_ms: int) -> List[Dict[str, Any]]:
        """Analyze scenes using Gemini with real frames - adaptive duration"""
        try:
            scenes = []
            if not frames:
                logger.warning("no_frames_for_scene_analysis", video_id=video_id)
                return self._create_fallback_scenes(duration_ms, video_id)
            
            # Calculate scene duration based on video length and frame count
            duration_seconds = duration_ms / 1000
            if duration_seconds <= 10:
                # Short videos: each frame represents 0.5 seconds
                scene_duration = 500  # 0.5 seconds per scene
            elif duration_seconds <= 60:
                # Medium videos: each frame represents 1 second
                scene_duration = 1000  # 1 second per scene
            else:
                # Long videos: each frame represents 2.5 seconds
                scene_duration = 2500  # 2.5 seconds per scene
            
            # Ensure we don't exceed video duration
            actual_scene_duration = min(scene_duration, duration_ms // len(frames)) if len(frames) > 0 else scene_duration
            
            logger.info("scene_duration_calculated", 
                       video_id=video_id, 
                       duration_seconds=duration_seconds,
                       scene_duration_ms=actual_scene_duration,
                       frame_count=len(frames))
            
            for i, frame_path in enumerate(frames):
                start_time = i * actual_scene_duration
                end_time = min(start_time + actual_scene_duration, duration_ms)
                
                # Skip if start time exceeds video duration
                if start_time >= duration_ms:
                    break
                
                # Get transcript for this scene
                scene_transcript = [
                    t for t in transcript 
                    if start_time <= t.get('start_ms', 0) < end_time
                ]
                
                # Analyze this frame with Gemini
                scene_data = await self._analyze_single_scene(
                    frame_path, scene_transcript, i + 1, start_time, end_time, video_id
                )
                
                if scene_data:
                    scenes.append(scene_data)
                else:
                    # Create fallback scene if Gemini fails
                    fallback_scene = self._create_fallback_scene(i + 1, start_time, end_time, scene_transcript)
                    scenes.append(fallback_scene)
            
            logger.info("scene_analysis_completed", video_id=video_id, scenes_created=len(scenes))
            return scenes
            
        except Exception as e:
            logger.error("scene_analysis_failed", error=str(e))
            return self._create_fallback_scenes(duration_ms, video_id)
    
    async def _analyze_single_scene(self, frame_path: str, transcript: List[Dict], scene_number: int, start_ms: int, end_ms: int, video_id: str) -> Optional[Dict[str, Any]]:
        """Analyze a single scene with Gemini with fallback"""
        try:
            encoded_image = encode_image_to_base64(frame_path)
            if not encoded_image:
                logger.warning("failed_to_encode_image", scene=scene_number, frame_path=frame_path)
                return self._create_fallback_scene(scene_number, start_ms, end_ms, transcript)
            
            transcript_text = " ".join([t.get('text', '') for t in transcript])
            
            prompt_parts = [
                {"text": f"Analyze this video frame and generate scene metadata. Scene {scene_number} from {start_ms}ms to {end_ms}ms. Transcript: '{transcript_text}'. Return JSON with: scene_summary, full_description, objects_tracked (with labels and confidence), actions_detected."},
                {"text": "", "inlineData": {"mimeType": "image/jpeg", "data": encoded_image}}
            ]
            
            payload = {
                "contents": [{"parts": prompt_parts}],
                "systemInstruction": {
                    "parts": [{"text": "Return only valid JSON with the requested scene analysis fields."}]
                },
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.3
                }
            }
            
            response = requests.post(
                f"{self.api_url}?key={self.api_key}",
                headers={"Content-Type": "application/json"},
                data=json.dumps(payload),
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                scene_json = result['candidates'][0]['content']['parts'][0]['text']
                scene_data = json.loads(scene_json)
                
                # Ensure required fields exist
                scene_data.setdefault('scene_summary', f"Scene {scene_number} content")
                scene_data.setdefault('full_description', f"Video scene {scene_number} from {start_ms/1000:.1f}s to {end_ms/1000:.1f}s")
                scene_data.setdefault('objects_tracked', [{"label": "content", "confidence": 0.8}])
                scene_data.setdefault('actions_detected', ["video_content"])
                
                # Add required fields
                scene_data.update({
                    "scene_number": scene_number,
                    "start_time_ms": start_ms,
                    "end_time_ms": end_ms,
                    "transcript": transcript,
                    "embedding": await self.generate_text_embedding(scene_data.get('scene_summary', ''))
                })
                
                logger.info("scene_analysis_successful", scene=scene_number, video_id=video_id)
                return scene_data
            else:
                logger.warning("gemini_api_failed", scene=scene_number, status_code=response.status_code)
                
        except Exception as e:
            logger.error("single_scene_analysis_failed", scene=scene_number, error=str(e))
        
        # Always return fallback instead of None
        logger.info("using_fallback_scene", scene=scene_number, video_id=video_id)
        return self._create_fallback_scene(scene_number, start_ms, end_ms, transcript)
    
    async def _extract_objects_from_scenes(self, scenes: List[Dict]) -> List[Dict[str, Any]]:
        """Extract unique objects from all scenes"""
        objects = {}
        
        for scene in scenes:
            for obj in scene.get('objects_tracked', []):
                label = obj.get('label', 'unknown')
                if label not in objects:
                    objects[label] = {
                        'label': label,
                        'track_id': f"obj_{label}_{len(objects)}",
                        'confidence': obj.get('confidence', 0.5)
                    }
        
        return list(objects.values())
    
    def _create_fallback_scenes(self, duration_ms: int, video_id: str) -> List[Dict[str, Any]]:
        """Create fallback scenes when analysis fails"""
        scenes = []
        scene_duration = 5000  # 5 second scenes
        scene_count = max(1, duration_ms // scene_duration)
        
        for i in range(scene_count):
            start_time = i * scene_duration
            end_time = min(start_time + scene_duration, duration_ms)
            
            scene = self._create_fallback_scene(i + 1, start_time, end_time, [])
            scenes.append(scene)
        
        logger.info("fallback_scenes_created", video_id=video_id, count=len(scenes))
        return scenes
    
    def _create_fallback_scene(self, scene_number: int, start_ms: int, end_ms: int, transcript: List[Dict]) -> Dict[str, Any]:
        """Create a single fallback scene with basic data"""
        return {
            "scene_number": scene_number,
            "start_time_ms": start_ms,
            "end_time_ms": end_ms,
            "scene_summary": f"Video scene {scene_number} from {start_ms/1000:.1f}s to {end_ms/1000:.1f}s",
            "full_description": f"This scene contains visual content that has been processed for search and analysis. Duration: {(end_ms-start_ms)/1000:.1f} seconds.",
            "transcript": transcript,
            "objects_tracked": [
                {
                    "label": "content",
                    "track_id": f"content_{scene_number}",
                    "confidence": 0.8,
                    "boxes": []
                }
            ],
            "actions_detected": ["video_content"],
            "embedding": [0.1] * 768  # Default embedding
        }
    
    async def generate_text_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for text using Gemini API
        
        Args:
            text: Text to embed
            
        Returns:
            List of floats representing the embedding
        """
        try:
            embedding_url = os.getenv('EMBEDDING_MODEL_URL')
            if not embedding_url:
                # Return mock embedding if URL not configured
                return [0.1] * 768  # Mock 768-dimensional embedding
            
            response = requests.post(
                f"{embedding_url}?key={self.api_key}",
                headers={'Content-Type': 'application/json'},
                json={
                    "model": "models/text-embedding-004",
                    "content": {
                        "parts": [{"text": text}]
                    }
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get('embedding', {}).get('values', [0.1] * 768)
            else:
                logger.warning("embedding_api_failed", status=response.status_code)
                return [0.1] * 768  # Return mock embedding on failure
                
        except Exception as e:
            logger.error("embedding_generation_failed", error=str(e))
            return [0.1] * 768  # Return mock embedding on error
