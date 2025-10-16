import redis
import os
from typing import Any, Optional, List
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

logger = structlog.get_logger()

class CacheService:
    def __init__(self):
        """Initialize Redis client with API key authentication"""
        try:
            self.redis_client = redis.Redis(
                host=os.getenv('REDIS_URL').split(':')[0],
                port=int(os.getenv('REDIS_URL').split(':')[1]),
                username='default',  # Redis Cloud uses 'default' as username
                password=os.getenv('REDIS_API'),  # Using the API key for authentication
                ssl=os.getenv('REDIS_SSL', 'true').lower() == 'true',
                decode_responses=True,
                socket_timeout=5,
                retry_on_timeout=True
            )
            # Test connection
            self.redis_client.ping()
            logger.info("redis_connection_established", 
                       host=os.getenv('REDIS_URL').split(':')[0])
        except redis.ConnectionError as e:
            logger.error("redis_connection_failed", error=str(e))
            raise

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def cache_vector(self, key: str, vector: List[float], ttl: int = None) -> None:
        """
        Cache vector with optional TTL
        
        Args:
            key: Unique identifier for the vector
            vector: The embedding vector to cache
            ttl: Time to live in seconds, defaults to VECTOR_CACHE_TTL from env
        """
        try:
            cache_key = f"vector:{key}"
            if ttl is None:
                ttl = int(os.getenv('VECTOR_CACHE_TTL', 3600))

            await self.redis_client.setex(
                name=cache_key,
                time=ttl,
                value=str(vector)
            )
            logger.debug("vector_cached", key=cache_key, ttl=ttl)
            
        except redis.RedisError as e:
            logger.error("vector_cache_failed", 
                        key=key, 
                        error=str(e))
            raise

    async def get_cached_vector(self, key: str) -> Optional[List[float]]:
        """
        Retrieve cached vector
        
        Args:
            key: Unique identifier for the vector
            
        Returns:
            The cached vector as a list of floats, or None if not found
        """
        try:
            cache_key = f"vector:{key}"
            result = await self.redis_client.get(cache_key)
            
            if result:
                logger.debug("vector_cache_hit", key=cache_key)
                return eval(result)  # Convert string representation back to list
            
            logger.debug("vector_cache_miss", key=cache_key)
            return None
            
        except redis.RedisError as e:
            logger.error("vector_cache_retrieval_failed", 
                        key=key,
                        error=str(e))
            return None

    async def delete_cached_vector(self, key: str) -> bool:
        """
        Delete a cached vector
        
        Args:
            key: Unique identifier for the vector
            
        Returns:
            bool: True if deleted, False otherwise
        """
        try:
            cache_key = f"vector:{key}"
            result = await self.redis_client.delete(cache_key)
            deleted = bool(result)
            
            if deleted:
                logger.debug("vector_cache_deleted", key=cache_key)
            else:
                logger.debug("vector_cache_delete_not_found", key=cache_key)
                
            return deleted
            
        except redis.RedisError as e:
            logger.error("vector_cache_deletion_failed",
                        key=key,
                        error=str(e))
            return False

    async def get_cache_stats(self) -> dict:
        """
        Get cache statistics
        
        Returns:
            dict: Cache statistics including size, memory usage, etc.
        """
        try:
            info = await self.redis_client.info()
            return {
                "used_memory": info['used_memory_human'],
                "connected_clients": info['connected_clients'],
                "uptime_days": info['uptime_in_days'],
                "hit_rate": info.get('keyspace_hits', 0) / (info.get('keyspace_hits', 0) + info.get('keyspace_misses', 1)),
            }
            
        except redis.RedisError as e:
            logger.error("cache_stats_retrieval_failed", error=str(e))
            return {}

    def close(self):
        """Close Redis connection"""
        try:
            self.redis_client.close()
            logger.info("redis_connection_closed")
        except redis.RedisError as e:
            logger.error("redis_connection_close_failed", error=str(e))