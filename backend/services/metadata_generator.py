import requests
import json
import base64
import os

# --- Configuration (Load from Environment Variables in a real app) ---
GEMINI_API_KEY = "YOUR_GEMINI_API_KEY" # Replace with your actual API key
MODEL_NAME = "gemini-2.5-flash-preview-05-20" # Excellent for fast, structured multimodal tasks
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent"

# The System Instruction sets the strict rules for JSON output
SYSTEM_INSTRUCTION = (
    "You are a video analysis expert. Your task is to generate a single, complete JSON object "
    "that strictly conforms to the 'scene_document_structure.md' schema. CRITICAL: Set the "
    "'scene_embedding' field to an empty array (value: []) as vectorization is handled "
    "by a separate service. Provide accurate, descriptive text for 'scene_summary' and 'full_description'."
)

def encode_image_to_base64(image_path):
    """Encodes a local image file (representative frame) to base64."""
    if not os.path.exists(image_path):
        print(f"Error: Image file not found at {image_path}")
        return None
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def generate_scene_metadata(video_details, representative_frames, transcript_text):
    """
    Calls the Gemini API to analyze video frames and text, generating the structured metadata.

    Args:
        video_details (dict): Metadata like video_id, scene_id, start/end times.
        representative_frames (list): List of paths to keyframe images.
        transcript_text (str): The full spoken dialogue for the segment.

    Returns:
        dict: The structured JSON metadata ready for vectorization and ingestion.
    """
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set.")

    # 1. Assemble the prompt parts
    prompt_parts = [
        {"text": f"Analyze the following frames and transcript to generate the scene metadata. Use the details: {json.dumps(video_details)}."},
        {"text": f"The full transcript for this segment is: \"{transcript_text}\""},
        {"text": "Ensure all nested fields for transcripts, keyframes, and objects are realistically populated."},
    ]

    # 2. Add base64-encoded frames to the prompt
    for frame_path in representative_frames:
        encoded_image = encode_image_to_base64(frame_path)
        if encoded_image:
            prompt_parts.append({
                "inlineData": {
                    "mimeType": "image/jpeg", # Assuming JPEG frames
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

# --- Example Usage (requires local image files) ---
if __name__ == "__main__":
    # Create dummy files for demonstration (you would load real frames)
    # This requires local files to run. Skip this block if you don't have images.
    
    # --- Dummy Data ---
    video_details = {
        "video_id": "PROD_2024_005",
        "scene_id": "S-003",
        "start_time_ms": 55000,
        "end_time_ms": 65000,
        "video_url": "s3://v8/prod/v005.mp4"
    }
    
    frames = ["frame_01.jpg", "frame_02.jpg"]
    # In a real setup, your Stage 2 would provide these paths.
    
    # --- Simulate a call (If you are running this locally, you must provide a valid API Key and real images) ---
    # metadata = generate_scene_metadata(video_details, frames, "The character says, 'I need to find the missing key before sunrise.'")
    # if metadata:
    #     print("\n--- SUCCESSFULLY GENERATED METADATA ---")
    #     print(json.dumps(metadata, indent=2))
    #     print("NEXT STEP: Pass this JSON to the vectorization and ingestion service.")
    pass
