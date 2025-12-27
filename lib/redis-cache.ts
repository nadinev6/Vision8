// Redis Cache Service for Vision8
// Provides caching for embeddings, search results, and video analysis

interface CacheConfig {
  redisUrl?: string;
  defaultTTL: number;
  maxRetries: number;
}

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class RedisCache {
  private config: CacheConfig;
  private memoryCache: Map<string, CacheItem<any>> = new Map();
  private redisAvailable = false;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      redisUrl: config.redisUrl || import.meta.env?.VITE_REDIS_URL,
      defaultTTL: config.defaultTTL || 3600, // 1 hour
      maxRetries: config.maxRetries || 3
    };

    // Initialize Redis connection if URL is provided
    if (this.config.redisUrl) {
      console.log('🔗 Redis URL found:', this.config.redisUrl.replace(/:[^:]*@/, ':***@')); // Hide password in logs
      this.initializeRedis();
    } else {
      console.log('📦 Redis URL not provided, using memory cache only');
      console.log('💡 To enable Redis caching, set VITE_REDIS_URL in your environment');
    }
  }

  private async initializeRedis(): Promise<void> {
    try {
      // For browser environment, we'll use a REST API approach to Redis
      // This would typically be handled by your backend
      console.log('🔗 Redis cache initialized (backend integration required)');
      this.redisAvailable = false; // Set to true when backend Redis is available
    } catch (error) {
      console.warn('⚠️ Redis initialization failed, falling back to memory cache:', error);
      this.redisAvailable = false;
    }
  }

  private generateKey(prefix: string, identifier: string): string {
    return `vision8:${prefix}:${identifier}`;
  }

  private isExpired(item: CacheItem<any>): boolean {
    return Date.now() - item.timestamp > item.ttl * 1000;
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, item] of this.memoryCache.entries()) {
      if (this.isExpired(item)) {
        this.memoryCache.delete(key);
      }
    }
  }

  // Cache embeddings to avoid regenerating them
  async cacheEmbedding(text: string, embedding: number[], ttl?: number): Promise<void> {
    const key = this.generateKey('embedding', this.hashString(text));
    const cacheItem: CacheItem<number[]> = {
      data: embedding,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL
    };

    // Store in memory cache
    this.memoryCache.set(key, cacheItem);
    
    // TODO: Store in Redis when backend is available
    if (this.redisAvailable) {
      // await this.setRedisValue(key, cacheItem, ttl);
    }

    console.log(`💾 Cached embedding for text: ${text.substring(0, 50)}...`);
  }

  async getCachedEmbedding(text: string): Promise<number[] | null> {
    const key = this.generateKey('embedding', this.hashString(text));
    
    // Check memory cache first
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem && !this.isExpired(memoryItem)) {
      console.log(`🎯 Cache hit for embedding: ${text.substring(0, 50)}...`);
      return memoryItem.data;
    }

    // TODO: Check Redis when backend is available
    if (this.redisAvailable) {
      // const redisItem = await this.getRedisValue(key);
      // if (redisItem) return redisItem.data;
    }

    return null;
  }

  // Cache search results
  async cacheSearchResults(
    query: string, 
    videoId: string | undefined, 
    results: any[], 
    searchType: 'vector' | 'text' | 'hybrid',
    ttl?: number
  ): Promise<void> {
    const identifier = `${searchType}:${query}:${videoId || 'all'}`;
    const key = this.generateKey('search', this.hashString(identifier));
    const cacheItem: CacheItem<any[]> = {
      data: results,
      timestamp: Date.now(),
      ttl: ttl || 300 // 5 minutes for search results
    };

    this.memoryCache.set(key, cacheItem);
    console.log(`💾 Cached ${searchType} search results for: ${query}`);
  }

  async getCachedSearchResults(
    query: string, 
    videoId: string | undefined, 
    searchType: 'vector' | 'text' | 'hybrid'
  ): Promise<any[] | null> {
    const identifier = `${searchType}:${query}:${videoId || 'all'}`;
    const key = this.generateKey('search', this.hashString(identifier));
    
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem && !this.isExpired(memoryItem)) {
      console.log(`🎯 Cache hit for ${searchType} search: ${query}`);
      return memoryItem.data;
    }

    return null;
  }

  // Cache video analysis results
  async cacheVideoAnalysis(videoId: string, analysis: any, ttl?: number): Promise<void> {
    const key = this.generateKey('analysis', videoId);
    const cacheItem: CacheItem<any> = {
      data: analysis,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL
    };

    this.memoryCache.set(key, cacheItem);
    console.log(`💾 Cached video analysis for: ${videoId}`);
  }

  async getCachedVideoAnalysis(videoId: string): Promise<any | null> {
    const key = this.generateKey('analysis', videoId);
    
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem && !this.isExpired(memoryItem)) {
      console.log(`🎯 Cache hit for video analysis: ${videoId}`);
      return memoryItem.data;
    }

    return null;
  }

  // Invalidate cache for a specific video
  async invalidateVideoCache(videoId: string): Promise<void> {
    const patterns = [
      this.generateKey('analysis', videoId),
      this.generateKey('search', ''), // This would need pattern matching in Redis
    ];

    // Clear from memory cache
    for (const [key] of this.memoryCache.entries()) {
      if (key.includes(videoId)) {
        this.memoryCache.delete(key);
      }
    }

    console.log(`🗑️ Invalidated cache for video: ${videoId}`);
  }

  // Clear all cache
  async clearCache(): Promise<void> {
    this.memoryCache.clear();
    console.log('🧹 Cleared all cache');
  }

  // Get cache statistics
  getCacheStats(): {
    memoryItems: number;
    redisAvailable: boolean;
    totalSize: number;
  } {
    this.cleanupMemoryCache();
    
    let totalSize = 0;
    for (const [, item] of this.memoryCache.entries()) {
      totalSize += JSON.stringify(item).length;
    }

    return {
      memoryItems: this.memoryCache.size,
      redisAvailable: this.redisAvailable,
      totalSize
    };
  }

  // Simple hash function for cache keys
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

// Global cache instance
export const cacheService = new RedisCache();

// Utility functions for common caching patterns
export async function withCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  // Try to get from cache first
  const cached = await cacheService.getCachedVideoAnalysis(key);
  if (cached) {
    return cached;
  }

  // Fetch fresh data
  const result = await fetchFn();
  
  // Cache the result
  await cacheService.cacheVideoAnalysis(key, result, ttl);
  
  return result;
}

export async function cacheEmbeddingWithFallback(
  text: string,
  generateFn: () => Promise<number[]>
): Promise<number[]> {
  // Try cache first
  const cached = await cacheService.getCachedEmbedding(text);
  if (cached) {
    return cached;
  }

  // Generate new embedding
  const embedding = await generateFn();
  
  // Cache it
  await cacheService.cacheEmbedding(text, embedding);
  
  return embedding;
}