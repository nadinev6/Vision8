import requests
import json
import base64
import os
import structlog
from    # Assemble the prompt parts
    prompt_parts: List[PromptPart] = [
        {"text": f"Analyze the following frames and transcript to generate the scene metadata. Use the details: {json.dumps(video_details)}."},
        {"text": f"The full transcript for this segment is: \"{transcript_text}\""},
        {"text": "Ensure all nested fields for transcripts, keyframes, and objects are realistically populated."},
    ]

    # Add base64-encoded frames to the prompt
    for frame_path in representative_frames:
        encoded_image = encode_image_to_base64(frame_path)
        if encoded_image:
            image_part: PromptPart = {
                "text": "",  # Required by Gemini API
                "inlineData": {
                    "mimeType": "image/jpeg", 
                    "data": encoded_image
                }
            }
            prompt_parts.append(image_part)t, List, Optional, Any, TypedDict
from datetime import datetime

class PromptPart(TypedDict, total=False):
    text: str
    inlineData: Dict[str, str]
from dotenv import load_dotenv

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
            } as Dict[str, Any])

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
