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
      baseUrl: config.baseUrl || (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1',
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
      videoId?: string;
      language?: string;
    } = {}
  ): Promise<{
    scenes: any[];
    transcripts: any[];
    objects: any[];
    keyframes?: string[];
    audioFeatures?: any;
    videoId?: string;
  }> {
    console.log('🚀 Starting advanced video analysis with backend...');

    const formData = new FormData();
    formData.append('file', videoFile); // Changed from 'video' to 'file' to match backend

    if (options.videoId) {
      formData.append('video_id', options.videoId);
    }

    if (options.language) {
      formData.append('language', options.language);
    }

    // Add other options if supported by backend Form parameters
    // Currently backend expects flattened Form fields, not a JSON string
    if (options.generateTranscripts !== undefined) {
      formData.append('include_transcription', String(options.generateTranscripts));
    }

    return this.makeRequest('/analysis/upload', {
      method: 'POST',
      body: formData,
      headers: {} // Don't set Content-Type for FormData, browser sets it with boundary
    });
  }

  // Batch embedding generation
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    console.log(`🔗 Generating ${texts.length} embeddings via backend...`);

    return this.makeRequest('/embeddings/batch', {
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

    return this.makeRequest('/analysis/search', {
      method: 'POST',
      body: JSON.stringify({ query, ...options })
    });
  }

  // Analyze Mux Asset
  async analyzeMuxAsset(
    muxAssetId: string,
    videoName?: string,
    options: {
      includeTranscription?: boolean;
      language?: string;
    } = {}
  ): Promise<any> {
    console.log(`🎬 Analyzing Mux asset via backend: ${muxAssetId}`);

    return this.makeRequest('/analysis/analyze/mux-asset', {
      method: 'POST',
      body: JSON.stringify({
        mux_asset_id: muxAssetId,
        video_name: videoName,
        include_transcription: options.includeTranscription ?? true,
        language: options.language ?? 'en-US'
      })
    });
  }

  // Get Video Details
  async getVideoDetails(videoId: string): Promise<any> {
    try {
      const data = await this.makeRequest<{ video: any }>(`/analysis/video/${videoId}`);
      return data.video;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      throw error;
    }
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
    return this.makeRequest('/health'); // Health is at /api/v1/health or /health. Backend has it at /health.
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
    const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1';
    const url = `${baseUrl}/analysis/search?query=${encodeURIComponent(query)}&max_results=${options.topK || 5}${options.videoId ? `&video_id=${options.videoId}` : ''}`;

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