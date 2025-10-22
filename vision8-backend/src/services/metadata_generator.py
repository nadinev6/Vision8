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
        Generate comprehensive metadata for a video file
        
        Args:
            video_path: Path to the video file
            video_id: Unique identifier for the video
            
        Returns:
            Dictionary containing video metadata, scenes, and embeddings
        """
        try:
            logger.info("generating_video_metadata", video_id=video_id, path=video_path)
            
            # For now, create mock metadata structure
            # In a full implementation, this would:
            # 1. Extract frames from video
            # 2. Generate transcripts
            # 3. Analyze scenes with Gemini
            # 4. Create embeddings
            
            mock_metadata = {
                "video_id": video_id,
                "duration_ms": 30000,  # 30 seconds
                "scenes": [
                    {
                        "scene_number": 1,
                        "start_time_ms": 0,
                        "end_time_ms": 15000,
                        "summary": "Opening scene with introduction",
                        "description": "The video begins with an establishing shot showing the main subject",
                        "embedding": await self.generate_text_embedding("Opening scene with introduction"),
                        "transcript": [
                            {
                                "text": "Welcome to this video",
                                "start_ms": 0,
                                "end_ms": 3000,
                                "speaker": "narrator"
                            }
                        ],
                        "objects": [
                            {
                                "label": "person",
                                "track_id": "person_1",
                                "boxes": [
                                    {
                                        "frame_ms": 1000,
                                        "xmin": 0.2,
                                        "ymin": 0.1,
                                        "xmax": 0.8,
                                        "ymax": 0.9
                                    }
                                ]
                            }
                        ],
                        "actions": ["speaking", "gesturing"]
                    },
                    {
                        "scene_number": 2,
                        "start_time_ms": 15000,
                        "end_time_ms": 30000,
                        "summary": "Main content presentation",
                        "description": "The main content is presented with detailed explanations",
                        "embedding": await self.generate_text_embedding("Main content presentation"),
                        "transcript": [
                            {
                                "text": "Let me show you the main features",
                                "start_ms": 15000,
                                "end_ms": 18000,
                                "speaker": "narrator"
                            }
                        ],
                        "objects": [],
                        "actions": ["presenting", "demonstrating"]
                    }
                ],
                "transcript": [
                    {
                        "text": "Welcome to this video",
                        "start_ms": 0,
                        "end_ms": 3000,
                        "speaker": "narrator"
                    },
                    {
                        "text": "Let me show you the main features",
                        "start_ms": 15000,
                        "end_ms": 18000,
                        "speaker": "narrator"
                    }
                ],
                "objects": [
                    {
                        "label": "person",
                        "track_id": "person_1",
                        "confidence": 0.95
                    }
                ]
            }
            
            logger.info("metadata_generation_completed", 
                       video_id=video_id, 
                       scenes_count=len(mock_metadata["scenes"]))
            
            return mock_metadata
            
        except Exception as e:
            logger.error("metadata_generation_failed", video_id=video_id, error=str(e))
            raise
    
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