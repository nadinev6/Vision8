// Cache Debug Utilities for Vision8
// Helps diagnose caching issues and Redis connectivity

import { cacheService } from './redis-cache';

export interface CacheDebugInfo {
  redisConfigured: boolean;
  redisUrl?: string;
  memoryStats: {
    items: number;
    totalSize: number;
  };
  environment: {
    viteRedisUrl?: string;
    nodeEnv?: string;
  };
}

export function getCacheDebugInfo(): CacheDebugInfo {
  const stats = cacheService.getCacheStats();
  
  return {
    redisConfigured: !!import.meta.env?.VITE_REDIS_URL,
    redisUrl: import.meta.env?.VITE_REDIS_URL ? 
      import.meta.env.VITE_REDIS_URL.replace(/:[^:]*@/, ':***@') : undefined,
    memoryStats: {
      items: stats.memoryItems,
      totalSize: stats.totalSize
    },
    environment: {
      viteRedisUrl: import.meta.env?.VITE_REDIS_URL ? 'configured' : 'missing',
      nodeEnv: import.meta.env?.NODE_ENV
    }
  };
}

export function logCacheStatus(): void {
  const info = getCacheDebugInfo();
  
  console.group('🔍 Vision8 Cache Status');
  console.log('Redis Configured:', info.redisConfigured ? '✅' : '❌');
  if (info.redisUrl) {
    console.log('Redis URL:', info.redisUrl);
  }
  console.log('Memory Cache Items:', info.memoryStats.items);
  console.log('Memory Cache Size:', `${(info.memoryStats.totalSize / 1024).toFixed(2)} KB`);
  console.log('Environment:', info.environment);
  console.groupEnd();
  
  if (!info.redisConfigured) {
    console.warn('⚠️ Redis not configured - using memory cache only');
    console.log('💡 Set VITE_REDIS_URL in your environment to enable Redis caching');
  }
}

// Test cache functionality
export async function testCache(): Promise<void> {
  console.log('🧪 Testing cache functionality...');
  
  try {
    // Test embedding cache
    const testEmbedding = new Array(768).fill(0.1);
    await cacheService.cacheEmbedding('test-text', testEmbedding);
    const cachedEmbedding = await cacheService.getCachedEmbedding('test-text');
    
    if (cachedEmbedding) {
      console.log('✅ Embedding cache working');
    } else {
      console.log('❌ Embedding cache failed');
    }
    
    // Test search results cache
    const testResults = [{ test: 'data' }];
    await cacheService.cacheSearchResults('test-query', 'test-video', testResults, 'hybrid');
    const cachedResults = await cacheService.getCachedSearchResults('test-query', 'test-video', 'hybrid');
    
    if (cachedResults) {
      console.log('✅ Search results cache working');
    } else {
      console.log('❌ Search results cache failed');
    }
    
    console.log('🎉 Cache test completed');
    
  } catch (error) {
    console.error('❌ Cache test failed:', error);
  }
}

// Expose debug utilities to window for console access
if (typeof window !== 'undefined') {
  (window as any).cacheDebug = {
    getInfo: getCacheDebugInfo,
    logStatus: logCacheStatus,
    test: testCache,
    clearCache: () => cacheService.clearCache()
  };
  
  console.log('🔧 Cache debug utilities available at window.cacheDebug');
  console.log('   - getInfo(): Get cache configuration info');
  console.log('   - logStatus(): Log current cache status');
  console.log('   - test(): Test cache functionality');
  console.log('   - clearCache(): Clear all cached data');
}