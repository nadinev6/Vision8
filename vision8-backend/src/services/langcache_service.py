import os
import requests
import hashlib
import json
from typing import Any, Optional, List, Dict
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential
from dotenv import load_dotenv

load_dotenv()
logger = structlog.get_logger()

class LangCacheService:
    def __init__(self):
        """Initialize LangCache client for embedding caching"""
        self.api_key = os.getenv('LANGCACHE_API_KEY')
        self.model = os.getenv('LANGCACHE_MODEL', 'langcache-embedding-model-v1')
        self.base_url = "https://api.langcache.com/v1"
        
        if not self.api_key:
            raise ValueError("LANGCACHE_API_KEY must be configured")
        
        self.headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        logger.info("langcache_service_initialized", model=self.model)

    def _generate_cache_key(self, text: str, model: str = None) -> str:
        """Generate a consistent cache key for text and model combination"""
        model = model or self.model
        content = f"{model}:{text}"
        return hashlib.sha256(content.encode()).hexdigest()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def get_cached_embedding(self, text: str, model: str = None) -> Optional[List[float]]:
        """
        Retrieve cached embedding for text
        
        Args:
            text: The text to get embedding for
            model: Optional model override
            
        Returns:
            Cached embedding vector or None if not found
        """
        try:
            cache_key = self._generate_cache_key(text, model)
            
            response = requests.get(
                f"{self.base_url}/cache/{cache_key}",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                embedding = data.get('embedding')
                if embedding:
                    logger.debug("embedding_cache_hit", key=cache_key[:16])
                    return embedding
            elif response.status_code == 404:
                logger.debug("embedding_cache_miss", key=cache_key[:16])
                return None
            else:
                logger.warning("cache_retrieval_error", 
                             status=response.status_code, 
                             error=response.text)
                return None
                
        except Exception as e:
            logger.error("cache_retrieval_failed", error=str(e))
            return None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def cache_embedding(self, text: str, embedding: List[float], model: str = None, ttl: int = None) -> bool:
        """
        Cache embedding for text
        
        Args:
            text: The original text
            embedding: The embedding vector
            model: Optional model override
            ttl: Time to live in seconds
            
        Returns:
            True if cached successfully
        """
        try:
            cache_key = self._generate_cache_key(text, model)
            ttl = ttl or int(os.getenv('VECTOR_CACHE_TTL', 3600))
            
            payload = {
                'key': cache_key,
                'text': text,
                'embedding': embedding,
                'model': model or self.model,
                'ttl': ttl,
                'metadata': {
                    'dimensions': len(embedding),
                    'created_at': None  # Will be set by LangCache
                }
            }
            
            response = requests.post(
                f"{self.base_url}/cache",
                headers=self.headers,
                json=payload,
                timeout=15
            )
            
            if response.status_code in [200, 201]:
                logger.debug("embedding_cached", key=cache_key[:16], dimensions=len(embedding))
                return True
            else:
                logger.warning("cache_storage_error", 
                             status=response.status_code, 
                             error=response.text)
                return False
                
        except Exception as e:
            logger.error("cache_storage_failed", error=str(e))
            return False

    def get_or_generate_embedding(self, text: str, generate_func, model: str = None) -> List[float]:
        """
        Get embedding from cache or generate and cache it
        
        Args:
            text: The text to get embedding for
            generate_func: Function to generate embedding if not cached
            model: Optional model override
            
        Returns:
            Embedding vector
        """
        # Try to get from cache first
        cached_embedding = self.get_cached_embedding(text, model)
        if cached_embedding:
            return cached_embedding
        
        # Generate new embedding
        try:
            embedding = generate_func(text)
            
            # Cache the new embedding
            self.cache_embedding(text, embedding, model)
            
            return embedding
            
        except Exception as e:
            logger.error("embedding_generation_failed", error=str(e))
            raise

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        try:
            response = requests.get(
                f"{self.base_url}/stats",
                headers=self.headers,
                timeout=10
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.warning("stats_retrieval_error", 
                             status=response.status_code)
                return {}
                
        except Exception as e:
            logger.error("stats_retrieval_failed", error=str(e))
            return {}

    def clear_cache(self, pattern: str = None) -> bool:
        """
        Clear cache entries
        
        Args:
            pattern: Optional pattern to match keys (if supported)
            
        Returns:
            True if successful
        """
        try:
            url = f"{self.base_url}/cache/clear"
            payload = {}
            if pattern:
                payload['pattern'] = pattern
            
            response = requests.delete(
                url,
                headers=self.headers,
                json=payload if payload else None,
                timeout=15
            )
            
            if response.status_code == 200:
                logger.info("cache_cleared", pattern=pattern)
                return True
            else:
                logger.warning("cache_clear_error", 
                             status=response.status_code)
                return False
                
        except Exception as e:
            logger.error("cache_clear_failed", error=str(e))
            return False