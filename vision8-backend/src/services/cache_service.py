import redis
import os
from typing import Any, Optional, List
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

logger = structlog.get_logger()

class CacheService:
    def __init__(self):
        """Initialize Redis client with fallback to memory cache"""
        self.redis_client = None
        self.memory_cache = {}  # Fallback in-memory cache
        self.use_memory_cache = False
        
        try:
            redis_url = os.getenv('REDIS_URL')
            redis_password = os.getenv('REDIS_PASSWORD')
            
            if not redis_url:
                logger.info("Redis not configured, using memory cache")
                self.use_memory_cache = True
                return
            
            # Parse Redis URL - handle different formats
            if redis_url.startswith('redis://'):
                # Check if password is already in URL
                if '@' not in redis_url and redis_password:
                    # Add password to URL: redis://:password@host:port
                    redis_url = redis_url.replace('redis://', f'redis://:{redis_password}@')
                
                self.redis_client = redis.from_url(
                    redis_url, 
                    decode_responses=True, 
                    socket_timeout=10,
                    socket_connect_timeout=10,
                    retry_on_timeout=True,
                    health_check_interval=30
                )
            else:
                # Handle host:port format
                try:
                    host, port = redis_url.split(':')
                    self.redis_client = redis.Redis(
                        host=host,
                        port=int(port),
                        password=redis_password,
                        decode_responses=True,
                        socket_timeout=10,
                        socket_connect_timeout=10,
                        retry_on_timeout=True,
                        health_check_interval=30
                    )
                except ValueError:
                    logger.error("Invalid Redis URL format", redis_url=redis_url)
                    self.use_memory_cache = True
                    return
            
            # Test connection
            self.redis_client.ping()
            logger.info("redis_connection_established", url=redis_url[:50] + "...", has_password=bool(redis_password))
            
        except redis.ConnectionError as e:
            logger.warning("redis_connection_failed_using_memory_cache", error=str(e))
            self.use_memory_cache = True
            self.redis_client = None
        except Exception as e:
            logger.warning("redis_initialization_failed_using_memory_cache", error=str(e))
            self.use_memory_cache = True
            self.redis_client = None

    def cache_vector(self, key: str, vector: List[float], ttl: int = None) -> None:
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

            if self.use_memory_cache:
                # Use in-memory cache
                import time
                self.memory_cache[cache_key] = {
                    'vector': vector,
                    'expires_at': time.time() + ttl
                }
                logger.debug("vector_cached_memory", key=cache_key, ttl=ttl)
            else:
                # Use Redis
                self.redis_client.setex(
                    name=cache_key,
                    time=ttl,
                    value=str(vector)
                )
                logger.debug("vector_cached_redis", key=cache_key, ttl=ttl)
            
        except Exception as e:
            logger.error("vector_cache_failed", 
                        key=key, 
                        error=str(e))
            # Don't raise - caching is not critical

    def get_cached_vector(self, key: str) -> Optional[List[float]]:
        """
        Retrieve cached vector
        
        Args:
            key: Unique identifier for the vector
            
        Returns:
            The cached vector as a list of floats, or None if not found
        """
        try:
            cache_key = f"vector:{key}"
            
            if self.use_memory_cache:
                # Use in-memory cache
                import time
                cached_item = self.memory_cache.get(cache_key)
                if cached_item:
                    if time.time() < cached_item['expires_at']:
                        logger.debug("vector_cache_hit_memory", key=cache_key)
                        return cached_item['vector']
                    else:
                        # Expired, remove it
                        del self.memory_cache[cache_key]
                
                logger.debug("vector_cache_miss_memory", key=cache_key)
                return None
            else:
                # Use Redis
                result = self.redis_client.get(cache_key)
                
                if result:
                    logger.debug("vector_cache_hit_redis", key=cache_key)
                    return eval(result)  # Convert string representation back to list
                
                logger.debug("vector_cache_miss_redis", key=cache_key)
                return None
            
        except Exception as e:
            logger.error("vector_cache_retrieval_failed", 
                        key=key,
                        error=str(e))
            return None

    def delete_cached_vector(self, key: str) -> bool:
        """
        Delete a cached vector
        
        Args:
            key: Unique identifier for the vector
            
        Returns:
            bool: True if deleted, False otherwise
        """
        try:
            cache_key = f"vector:{key}"
            result = self.redis_client.delete(cache_key)
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

    def get_cache_stats(self) -> dict:
        """
        Get cache statistics
        
        Returns:
            dict: Cache statistics including size, memory usage, etc.
        """
        try:
            info = self.redis_client.info()
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
            if self.redis_client is not None:
                self.redis_client.close()
                logger.info("redis_connection_closed")
            else:
                logger.info("no_redis_connection_to_close")
        except redis.RedisError as e:
            logger.error("redis_connection_close_failed", error=str(e))
        except Exception as e:
            logger.error("cache_service_close_failed", error=str(e))
