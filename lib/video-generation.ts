// Video Generation Service for Vision8 Frontend
// Integrates with backend video generation API for Veo-3 and other models

interface GenerationRequest {
  videoId: string;
  sceneId: string;
  prompt: string;
  model?: 'wan2.2';
  quality?: 'draft' | 'standard' | 'high';
  durationSeconds?: number;
  referenceFrame?: string;
  styleSettings?: Record<string, any>;
}

interface GenerationResponse {
  jobId: string;
  status: string;
  message: string;
  estimatedCompletionSeconds?: number;
  generationUrl?: string;
}

interface GenerationStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  generationUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  fileSize?: number;
  errorMessage?: string;
  createdAt: number;
  completedAt?: number;
}

class VideoGenerationService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8000';
  }

  async generateScene(request: GenerationRequest): Promise<GenerationResponse> {
    console.log('🎬 Starting scene generation:', request);

    const response = await fetch(`${this.baseUrl}/api/v1/video/generation/generate-scene`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        video_id: request.videoId,
        scene_id: request.sceneId,
        prompt: request.prompt,
        model: request.model || 'wan2.2',
        quality: request.quality || 'standard',
        duration_seconds: request.durationSeconds || 5.0,
        reference_frame: request.referenceFrame,
        style_settings: request.styleSettings
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Generation request failed');
    }

    const result = await response.json();
    console.log('✅ Generation initiated:', result);
    return result;
  }

  async getGenerationStatus(jobId: string): Promise<GenerationStatus> {
    const response = await fetch(`${this.baseUrl}/api/v1/video/generation/status/${jobId}`);

    if (!response.ok) {
      throw new Error('Failed to get generation status');
    }

    return await response.json();
  }
  async listGenerations(videoId: string): Promise<GenerationStatus[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/video/generation/list/${videoId}`);

    if (!response.ok) {
      throw new Error('Failed to list generations');
    }

    return await response.json();
  }

  async deleteGeneration(jobId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/v1/video/generation/delete/${jobId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete generation');
    }
  }

  async getSupportedModels(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/video/generation/models`);

    if (!response.ok) {
      throw new Error('Failed to get supported models');
    }

    const result = await response.json();
    return result.supported_models;
  }

  async getQualityPresets(): Promise<Record<string, any>> {
    const response = await fetch(`${this.baseUrl}/api/v1/video/generation/quality-presets`);

    if (!response.ok) {
      throw new Error('Failed to get quality presets');
    }

    const result = await response.json();
    return result.quality_presets;
  }

  async waitForCompletion(
    jobId: string,
    onProgress?: (status: GenerationStatus) => void,
    timeoutMs: number = 300000
  ): Promise<GenerationStatus> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getGenerationStatus(jobId);

      if (onProgress) {
        onProgress(status);
      }

      if (status.status === 'completed') {
        console.log('✅ Generation completed:', status);
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(status.errorMessage || 'Generation failed');
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Generation timeout');
  }
}

export const videoGenerationService = new VideoGenerationService();

export async function generateSceneReplacement(
  videoId: string,
  sceneId: string,
  prompt: string,
  options: {
    model?: 'wan2.2';
    quality?: 'draft' | 'standard' | 'high';
    duration?: number;
    referenceFrame?: string;
  } = {}
): Promise<GenerationResponse> {
  return videoGenerationService.generateScene({
    videoId,
    sceneId,
    prompt,
    model: options.model || 'wan2.2',
    quality: options.quality || 'standard',
    durationSeconds: options.duration || 5.0,
    referenceFrame: options.referenceFrame
  });
}

export async function pollGenerationStatus(
  jobId: string,
  onUpdate?: (status: GenerationStatus) => void
): Promise<GenerationStatus> {
  return videoGenerationService.waitForCompletion(jobId, onUpdate);
}

export function createGenerationCallbacks(
  videoId: string,
  onGenerationStart?: (jobId: string) => void,
  onGenerationComplete?: (result: GenerationStatus) => void
) {
  return {
    onModelChange: (model: 'wan2.2') => {
      console.log(`🔄 Model changed to: ${model}`);
      localStorage.setItem('preferred_generation_model', model);
    },

    onFrameRangeChange: (start: number, end: number) => {
      console.log(`🎯 Frame range changed: ${start}-${end}`);
      localStorage.setItem('generation_frame_range', JSON.stringify({ start, end }));
    },

    onVideoNameChange: (name: string) => {
      console.log(`📝 Video name changed: ${name}`);
      localStorage.setItem('generation_video_name', name);
    }
  };
}

if (typeof window !== 'undefined') {
  (window as any).videoGeneration = {
    service: videoGenerationService,
    generateScene: generateSceneReplacement,
    pollStatus: pollGenerationStatus
  };
}