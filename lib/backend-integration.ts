// Backend Integration for Vision8
// Handles communication with the Python backend for advanced features

interface BackendConfig {
  baseUrl: string;
  timeout: number;
}

class BackendService {
  private config: BackendConfig;

  constructor(config: Partial<BackendConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8000',
      timeout: config.timeout || 30000
    };
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Backend request timed out');
      }
      throw error;
    }
  }

  // Enhanced video analysis with backend processing
  async analyzeVideoAdvanced(
    videoFile: File,
    options: {
      extractKeyframes?: boolean;
      generateTranscripts?: boolean;
      detectObjects?: boolean;
      extractAudio?: boolean;
    } = {}
  ): Promise<{
    scenes: any[];
    transcripts: any[];
    objects: any[];
    keyframes?: string[];
    audioFeatures?: any;
  }> {
    console.log('🚀 Starting advanced video analysis with backend...');

    const formData = new FormData();
    formData.append('video', videoFile);
    formData.append('options', JSON.stringify(options));

    return this.makeRequest('/api/analyze-video', {
      method: 'POST',
      body: formData,
      headers: {} // Don't set Content-Type for FormData
    });
  }

  // Batch embedding generation
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    console.log(`🔗 Generating ${texts.length} embeddings via backend...`);

    return this.makeRequest('/api/embeddings/batch', {
      method: 'POST',
      body: JSON.stringify({ texts })
    });
  }

  // Advanced search with backend processing
  async searchAdvanced(
    query: string,
    options: {
      videoId?: string;
      searchType?: 'vector' | 'text' | 'hybrid';
      topK?: number;
      filters?: Record<string, any>;
      includeKeyframes?: boolean;
    } = {}
  ): Promise<{
    results: any[];
    totalHits: number;
    searchTime: number;
  }> {
    console.log('🔍 Performing advanced search via backend...');

    return this.makeRequest('/api/search/advanced', {
      method: 'POST',
      body: JSON.stringify({ query, ...options })
    });
  }

  // Health check
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    services: {
      metadata_generator: boolean;
      gemini: boolean;
    };
    version: string;
  }> {
    return this.makeRequest('/api/health');
  }
}

// Global backend service instance
export const backendService = new BackendService();

// Utility functions for backend integration
export async function withBackendFallback<T>(
  backendFn: () => Promise<T>,
  fallbackFn: () => Promise<T>
): Promise<T> {
  try {
    return await backendFn();
  } catch (error) {
    console.warn('Backend operation failed, using fallback:', error);
    return await fallbackFn();
  }
}

export async function isBackendAvailable(): Promise<boolean> {
  try {
    const health = await backendService.healthCheck();
    return health.status === 'healthy';
  } catch (error) {
    return false;
  }
}

// Enhanced functions that use backend when available
export async function generateEmbeddingEnhanced(text: string): Promise<number[]> {
  return withBackendFallback(
    async () => {
      const embeddings = await backendService.generateEmbeddingsBatch([text]);
      return embeddings[0];
    },
    async () => {
      // Fallback to direct Gemini API call
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': (import.meta as any).env?.VITE_GEMINI_API_KEY || 'AIzaSyBFYFaDZHneXJ0PMzeQRUvN-98A3FJ-3SU'
        },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: {
            parts: [{ text: text.substring(0, 1000) }]
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Embedding API error: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding.values;
    }
  );
}

export async function searchEnhanced(
  query: string,
  options: {
    videoId?: string;
    searchType?: 'vector' | 'text' | 'hybrid';
    topK?: number;
  } = {}
): Promise<any[]> {
  try {
    const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8000';
    const url = `${backendUrl}/api/v1/analysis/search?query=${encodeURIComponent(query)}&max_results=${options.topK || 5}${options.videoId ? `&video_id=${options.videoId}` : ''}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = await response.json();
    return (data.results || []).map((doc: any) => ({
      document: {
        ...doc,
        scene_summary: doc.summary || doc.description,
        start_time_ms: doc.time_ms || doc.start_time_ms
      }
    }));
  } catch (error) {
    console.error('Search enhanced failed:', error);
    return [];
  }
}