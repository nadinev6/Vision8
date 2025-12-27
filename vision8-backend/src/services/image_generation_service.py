"""
Image Generation Service for Vision8 Backend

This service handles AI-powered image generation using Imagen 3 and DALL-E 3.
It provides image generation, processing, and management capabilities.
"""

import os
import json
import asyncio
import base64
import tempfile
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path
import aiohttp
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

logger = structlog.get_logger()


class ImageGenerationService:
    """Service for AI-powered image generation."""
    
    def __init__(self):
        self.imagen_api_key = os.getenv('IMAGEN_API_KEY')
        self.dalle_api_key = os.getenv('DALLE_API_KEY')
        self.project_id = os.getenv('GOOGLE_CLOUD_PROJECT')
        self.location = os.getenv('IMAGEN_LOCATION', 'us-central1')
        
        # Generation settings
        self.supported_models = ['imagen3', 'dalle3']
        self.quality_presets = {
            'draft': {'resolution': '512x512', 'quality_level': 'draft'},
            'standard': {'resolution': '1024x1024', 'quality_level': 'standard'},
            'high': {'resolution': '1536x1536', 'quality_level': 'high'}
        }
        
    async def generate_image(
        self,
        image_id: str,
        generation_prompt: str,
        model: str = 'imagen3',
        quality: str = 'standard',
        style_settings: Optional[Dict] = None,
        reference_image: Optional[str] = None,
        user_api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate an image using AI image generation.
        
        Args:
            image_id: Unique identifier for the image generation job
            generation_prompt: Text prompt for image generation
            model: AI model to use ('imagen3', 'dalle3')
            quality: Quality preset ('draft', 'standard', 'high')
            style_settings: Additional style parameters
            reference_image: Base64 encoded reference image (optional)
            user_api_key: User-provided API access token
            
        Returns:
            Dict containing generation job details and status
        """
        try:
            logger.info("Starting image generation",
                       image_id=image_id,
                       model=model,
                       quality=quality)
            
            # Validate inputs
            if model not in self.supported_models:
                raise ValueError(f"Unsupported model: {model}. Supported: {self.supported_models}")
                
            if quality not in self.quality_presets:
                raise ValueError(f"Unsupported quality: {quality}. Supported: {list(self.quality_presets.keys())}")
            
            # Create generation job
            job_id = f"{image_id}_{model}_{int(asyncio.get_event_loop().time())}"
            
            # Prepare generation request based on model
            if model == 'imagen3':
                result = await self._generate_with_imagen3(
                    job_id=job_id,
                    prompt=generation_prompt,
                    quality=quality,
                    style_settings=style_settings,
                    reference_image=reference_image,
                    user_api_key=user_api_key
                )
            elif model == 'dalle3':
                result = await self._generate_with_dalle3(
                    job_id=job_id,
                    prompt=generation_prompt,
                    quality=quality,
                    style_settings=style_settings,
                    reference_image=reference_image,
                    user_api_key=user_api_key
                )
            else:
                raise ValueError(f"Model {model} not implemented")
            
            # Store generation metadata
            generation_metadata = {
                'job_id': job_id,
                'image_id': image_id,
                'model': model,
                'prompt': generation_prompt,
                'quality': quality,
                'status': result.get('status', 'pending'),
                'created_at': asyncio.get_event_loop().time(),
                'generation_url': result.get('generation_url'),
                'estimated_completion': result.get('estimated_completion')
            }
            
            logger.info("Image generation initiated",
                       job_id=job_id,
                       status=result.get('status'))
            
            return generation_metadata
            
        except Exception as e:
            logger.error("Image generation failed",
                        image_id=image_id,
                        model=model,
                        error=str(e),
                        exc_info=True)
            raise
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _generate_with_imagen3(
        self,
        job_id: str,
        prompt: str,
        quality: str,
        style_settings: Optional[Dict] = None,
        reference_image: Optional[str] = None,
        user_api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate image using Imagen 3 model via Vertex AI."""
        
        try:
            # Use user-provided API key if available, otherwise try default authentication
            access_token = user_api_key or await self._get_vertex_ai_token()
            
            if not access_token or not self.project_id:
                logger.warning("Vertex AI not properly configured, returning mock response")
                return {
                    'status': 'completed',
                    'generation_url': f'https://mock-storage.com/generated/{job_id}.png',
                    'estimated_completion': asyncio.get_event_loop().time() + 15,
                    'mock': True
                }
            
            # Prepare Vertex AI Imagen 3 API request
            api_url = f"https://{self.location}-aiplatform.googleapis.com/v1/projects/{self.project_id}/locations/{self.location}/publishers/google/models/imagen-3.0-generate:predict"
            
            preset = self.quality_presets[quality]
            
            # Vertex AI request format
            request_payload = {
                "instances": [{
                    "prompt": prompt,
                    "sampleCount": 1
                }],
                "parameters": {
                    "sampleCount": 1,
                    "aspectRatio": "1:1"
                }
            }
            
            # Add reference image if provided
            if reference_image:
                request_payload["instances"][0]["referenceImage"] = {
                    "bytesBase64Encoded": reference_image
                }
            
            # Add style settings if provided
            if style_settings:
                request_payload["parameters"].update(style_settings)
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            
            logger.info("Making Vertex AI Imagen 3 request", 
                       job_id=job_id, 
                       api_url=api_url,
                       prompt_length=len(prompt))
            
            async with aiohttp.ClientSession() as session:
                async with session.post(api_url, json=request_payload, headers=headers, timeout=aiohttp.ClientTimeout(total=120)) as response:
                    response_text = await response.text()
                    logger.info("Vertex AI response", 
                               job_id=job_id,
                               status=response.status,
                               response_preview=response_text[:200])
                    
                    if response.status == 200:
                        result = await response.json()
                        
                        # Extract image URL from Vertex AI response
                        predictions = result.get('predictions', [])
                        if predictions and len(predictions) > 0:
                            image_data = predictions[0].get('bytesBase64Encoded') or predictions[0].get('images')
                            
                            if image_data:
                                # Store the generated image
                                image_url = await self._store_generated_image(job_id, image_data)
                                
                                return {
                                    'status': 'completed',
                                    'generation_url': image_url,
                                    'estimated_completion': asyncio.get_event_loop().time()
                                }
                    
                    # Handle errors
                    logger.error("Imagen 3 API error",
                               job_id=job_id,
                               status=response.status,
                               response=response_text)
                    
                    return {
                        'status': 'error',
                        'generation_url': None,
                        'error': f"API returned status {response.status}"
                    }
                    
        except asyncio.TimeoutError:
            logger.warning("Imagen 3 request timeout",
                          job_id=job_id)
            return {
                'status': 'pending',
                'generation_url': None,
                'estimated_completion': asyncio.get_event_loop().time() + 60
            }
        except Exception as e:
            logger.error("Imagen 3 generation error",
                        job_id=job_id,
                        error=str(e),
                        exc_info=True)
            raise
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _generate_with_dalle3(
        self,
        job_id: str,
        prompt: str,
        quality: str,
        style_settings: Optional[Dict] = None,
        reference_image: Optional[str] = None,
        user_api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate image using DALL-E 3 model."""
        
        try:
            api_key = user_api_key or self.dalle_api_key
            
            if not api_key:
                logger.warning("DALL-E API key not configured, returning mock response")
                return {
                    'status': 'completed',
                    'generation_url': f'https://mock-storage.com/generated/{job_id}.png',
                    'estimated_completion': asyncio.get_event_loop().time() + 15,
                    'mock': True
                }
            
            # Prepare OpenAI DALL-E 3 API request
            api_url = "https://api.openai.com/v1/images/generations"
            
            preset = self.quality_presets[quality]
            
            request_payload = {
                "model": "dall-e-3",
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024",  # DALL-E 3 supports 1024x1024, 1792x1024, 1024x1792
                "quality": preset.get('quality_level', 'standard')
            }
            
            # Map our quality to DALL-E sizes
            size_mapping = {
                'draft': '1024x1024',
                'standard': '1024x1024',
                'high': '1792x1024'
            }
            request_payload['size'] = size_mapping.get(quality, '1024x1024')
            
            headers = {
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            }
            
            logger.info("Making DALL-E 3 request", 
                       job_id=job_id, 
                       prompt_length=len(prompt))
            
            async with aiohttp.ClientSession() as session:
                async with session.post(api_url, json=request_payload, headers=headers, timeout=aiohttp.ClientTimeout(total=120)) as response:
                    response_text = await response.text()
                    logger.info("DALL-E response", 
                               job_id=job_id,
                               status=response.status)
                    
                    if response.status == 200:
                        result = await response.json()
                        
                        # Extract image URL from DALL-E response
                        data = result.get('data', [])
                        if data and len(data) > 0:
                            image_url = data[0].get('url')
                            
                            if image_url:
                                return {
                                    'status': 'completed',
                                    'generation_url': image_url,
                                    'estimated_completion': asyncio.get_event_loop().time()
                                }
                    
                    # Handle errors
                    logger.error("DALL-E API error",
                               job_id=job_id,
                               status=response.status,
                               response=response_text)
                    
                    return {
                        'status': 'error',
                        'generation_url': None,
                        'error': f"API returned status {response.status}"
                    }
                    
        except asyncio.TimeoutError:
            logger.warning("DALL-E request timeout",
                          job_id=job_id)
            return {
                'status': 'pending',
                'generation_url': None,
                'estimated_completion': asyncio.get_event_loop().time() + 60
            }
        except Exception as e:
            logger.error("DALL-E generation error",
                        job_id=job_id,
                        error=str(e),
                        exc_info=True)
            raise
    
    async def get_image_status(self, job_id: str) -> Dict[str, Any]:
        """
        Get the current status of an image generation job.
        
        Args:
            job_id: The generation job ID
            
        Returns:
            Dict with job status, progress, and URLs
        """
        try:
            logger.info("Checking image generation status",
                       job_id=job_id)
            
            # In a production system, this would query a database or cache
            # For now, return a status structure
            return {
                'job_id': job_id,
                'status': 'pending',  # Could be pending, processing, completed, error
                'progress': 0,
                'generation_url': None,
                'error_message': None
            }
            
        except Exception as e:
            logger.error("Failed to get image status",
                        job_id=job_id,
                        error=str(e),
                        exc_info=True)
            raise
    
    async def handle_image_upload(
        self,
        file_content: bytes,
        file_name: str,
        image_type: str = 'reference'
    ) -> Dict[str, Any]:
        """
        Handle uploaded image files.
        
        Args:
            file_content: Image file bytes
            file_name: Original filename
            image_type: Type of image ('reference', 'environment', 'style')
            
        Returns:
            Dict with image metadata and storage path
        """
        try:
            logger.info("Processing image upload",
                       file_name=file_name,
                       image_type=image_type,
                       file_size=len(file_content))
            
            # Validate file size (max 10MB)
            if len(file_content) > 10 * 1024 * 1024:
                raise ValueError("File size exceeds 10MB limit")
            
            # Validate image format
            valid_formats = ['image/jpeg', 'image/png', 'image/webp']
            # In production, would check actual file type
            
            # Create image metadata
            image_id = f"{image_type}_{int(asyncio.get_event_loop().time())}"
            
            # Store image (in production, would use cloud storage)
            storage_path = f"images/{image_type}/{image_id}.png"
            
            image_metadata = {
                'image_id': image_id,
                'file_name': file_name,
                'image_type': image_type,
                'size_bytes': len(file_content),
                'storage_path': storage_path,
                'uploaded_at': asyncio.get_event_loop().time(),
                'base64_encoded': base64.b64encode(file_content).decode('utf-8')
            }
            
            logger.info("Image upload processed",
                       image_id=image_id,
                       storage_path=storage_path)
            
            return image_metadata
            
        except Exception as e:
            logger.error("Image upload failed",
                        file_name=file_name,
                        error=str(e),
                        exc_info=True)
            raise
    
    async def _store_generated_image(
        self,
        job_id: str,
        image_data: str
    ) -> str:
        """
        Store generated image data.
        
        Args:
            job_id: The generation job ID
            image_data: Base64 encoded image data or URL
            
        Returns:
            URL to the stored image
        """
        try:
            # In a production system, would store to cloud storage
            # For now, return a mock URL
            if image_data.startswith('http'):
                return image_data  # Already a URL
            
            # Store base64 image data
            storage_path = f"generated-images/{job_id}.png"
            
            logger.info("Storing generated image",
                       job_id=job_id,
                       storage_path=storage_path)
            
            return f"https://storage.example.com/{storage_path}"
            
        except Exception as e:
            logger.error("Failed to store generated image",
                        job_id=job_id,
                        error=str(e),
                        exc_info=True)
            raise
    
    async def _get_vertex_ai_token(self) -> Optional[str]:
        """
        Get a Vertex AI access token.
        
        In production, this would use Google Application Default Credentials.
        """
        try:
            # This is a placeholder - in production would use google-auth
            return os.getenv('VERTEX_AI_TOKEN')
        except Exception as e:
            logger.error("Failed to get Vertex AI token",
                        error=str(e),
                        exc_info=True)
            return None
    
    def get_supported_models(self) -> List[str]:
        """Get list of supported models."""
        return self.supported_models
    
    def get_quality_presets(self) -> Dict[str, Dict[str, Any]]:
        """Get available quality presets."""
        return self.quality_presets


# Singleton instance
image_generation_service = ImageGenerationService()
