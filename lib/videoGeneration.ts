/**
 * Video Generation Service
 * 
 * Handles communication with the backend video generation API
 * for scene replacement and video generation workflows.
 */

const API_BASE_URL = 'http://localhost:8000/api/v1/video/generation';

export interface GenerationRequest {
  video_id: string;
  scene_id: string;
  prompt: string;
  model?: string;
  quality?: string;
  duration_seconds?: number;
  reference_frame?: string;
  style_settings?: Record<string, any>;
  structured_context?: any;
  user_api_key?: string;
}

export interface GenerationResponse {
  job_id: string;
  status: string;
  message: string;
  estimated_completion_seconds?: number;
  generation_url?: string;
}

export interface GenerationStatus {
  job_id: string;
  status: string;
  progress: number;
  generation_url?: string;
  thumbnail_url?: string;
  duration?: number;
  file_size?: number;
  error_message?: string;
  created_at: number;
  completed_at?: number;
  download_url?: string;
  stream_url?: string;
}

export interface GenerationListItem {
  job_id: string;
  scene_id: string;
  model: string;
  status: string;
  created_at: number;
  generation_url?: string;
}

export class VideoGenerationService {
  private static instance: VideoGenerationService;

  public static getInstance(): VideoGenerationService {
    if (!VideoGenerationService.instance) {
      VideoGenerationService.instance = new VideoGenerationService();
    }
    return VideoGenerationService.instance;
  }

  /**
   * Generate a replacement scene using AI video generation
   */
  async generateScene(request: GenerationRequest): Promise<GenerationResponse> {
    try {
      console.log('Starting scene generation:', request);

      // Enhance the prompt with structured context if available
      const enhancedRequest = await this.enhancePromptWithContext(request);

      const response = await fetch(`${API_BASE_URL}/generate-scene`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_id: enhancedRequest.video_id,
          scene_id: enhancedRequest.scene_id,
          prompt: enhancedRequest.prompt,
          structured_context: enhancedRequest.structured_context,
          model: enhancedRequest.model || 'wan2.2',
          quality: enhancedRequest.quality || 'standard',
          duration_seconds: enhancedRequest.duration_seconds || 5.0,
          reference_frame: enhancedRequest.reference_frame,
          style_settings: enhancedRequest.style_settings,
          user_api_key: enhancedRequest.user_api_key
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Generation failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Scene generation initiated:', result);
      return result;

    } catch (error) {
      console.error('❌ Scene generation failed:', error);
      throw error;
    }
  }

  /**
   * Enhance user prompt with structured scene context
   */
  private async enhancePromptWithContext(request: GenerationRequest): Promise<GenerationRequest & { structured_context?: any }> {
    try {
      // Get scene context from analysis system
      const sceneContext = await this.getSceneContext(request.video_id, request.scene_id);

      if (!sceneContext) {
        return request; // Return original if no context available
      }

      // Create structured prompt that combines user intent with scene data
      const enhancedPrompt = await this.createConversationalPrompt(request.prompt, sceneContext);

      return {
        ...request,
        prompt: enhancedPrompt,
        structured_context: sceneContext
      };

    } catch (error) {
      console.warn('Failed to enhance prompt with context:', error);
      return request; // Fallback to original request
    }
  }

  /**
   * Get scene context from the RAG system
   */
  private async getSceneContext(videoId: string, sceneId: string): Promise<any> {
    try {
      // Get scene context from the analysis API
      const response = await fetch(`http://localhost:8000/api/v1/video/analysis/scene/${videoId}/${sceneId}`);

      if (!response.ok) {
        throw new Error(`Failed to get scene context: ${response.status}`);
      }

      const result = await response.json();
      return result.scene_context;
    } catch (error) {
      console.warn('Could not retrieve scene context:', error);
      return null;
    }
  }

  /**
   * Create conversational prompt that preserves structure while allowing modifications
   */
  private async createConversationalPrompt(userPrompt: string, sceneContext: any): Promise<string> {
    const structuredPrompt = `
SCENE CONTEXT (Preserve these details unless explicitly modified):
- Scene Summary: ${sceneContext.scene_summary}
- Duration: ${sceneContext.start_time_ms}ms to ${sceneContext.end_time_ms}ms
- Objects Present: ${sceneContext.objects_tracked?.map((obj: any) => obj.label).join(', ') || 'None detected'}
- Dialogue: ${sceneContext.transcript_phrases?.map((t: any) => t.text).join(' ') || 'No dialogue'}
- Visual Style: ${sceneContext.visual_style || 'Maintain original style'}

USER MODIFICATION REQUEST:
${userPrompt}

GENERATION INSTRUCTIONS:
1. Maintain all scene context details UNLESS the user specifically requests changes
2. Apply the user's modification request while preserving narrative continuity
3. Keep the same duration and timing unless explicitly changed
4. Maintain visual consistency with the original scene
5. If objects are mentioned for removal/addition, adjust accordingly
6. If dialogue changes are requested, update transcript accordingly

Generate a video that combines the original scene structure with the requested modifications.
`;

    return structuredPrompt;
  }

  /**
   * Get the status of a generation job
   */
  async getGenerationStatus(jobId: string): Promise<GenerationStatus> {
    try {
      const response = await fetch(`${API_BASE_URL}/status/${jobId}`);

      if (!response.ok) {
        throw new Error(`Failed to get status: ${response.status}`);
      }

      const status = await response.json();
      console.log('Generation status:', status);
      return status;

    } catch (error) {
      console.error('❌ Failed to get generation status:', error);
      throw error;
    }
  }

  /**
   * List all generations for a video
   */
  async listGenerations(videoId: string): Promise<GenerationListItem[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/list/${videoId}`);

      if (!response.ok) {
        throw new Error(`Failed to list generations: ${response.status}`);
      }

      const generations = await response.json();
      console.log('Video generations:', generations);
      return generations;

    } catch (error) {
      console.error('❌ Failed to list generations:', error);
      throw error;
    }
  }

  /**
   * Delete a generation job
   */
  async deleteGeneration(jobId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/delete/${jobId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`Failed to delete generation: ${response.status}`);
      }

      console.log('✅ Generation deleted:', jobId);

    } catch (error) {
      console.error('❌ Failed to delete generation:', error);
      throw error;
    }
  }

  /**
   * Get supported models
   */
  async getSupportedModels(): Promise<string[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/models`);

      if (!response.ok) {
        throw new Error(`Failed to get models: ${response.status}`);
      }

      const data = await response.json();
      return data.supported_models;

    } catch (error) {
      console.error('❌ Failed to get supported models:', error);
      return ['wan2.2']; // Fallback
    }
  }

  /**
   * Get quality presets
   */
  async getQualityPresets(): Promise<Record<string, any>> {
    try {
      const response = await fetch(`${API_BASE_URL}/quality-presets`);

      if (!response.ok) {
        throw new Error(`Failed to get quality presets: ${response.status}`);
      }

      const data = await response.json();
      return data.quality_presets;

    } catch (error) {
      console.error('❌ Failed to get quality presets:', error);
      return {
        draft: { resolution: '480p', fps: 24 },
        standard: { resolution: '720p', fps: 30 },
        high: { resolution: '1080p', fps: 30 }
      }; // Fallback
    }
  }

  /**
   * Poll generation status until completion
   */
  async pollGenerationStatus(
    jobId: string,
    onProgress?: (status: GenerationStatus) => void,
    maxAttempts: number = 60,
    intervalMs: number = 5000
  ): Promise<GenerationStatus> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const status = await this.getGenerationStatus(jobId);

        if (onProgress) {
          onProgress(status);
        }

        // Check if generation is complete
        if (status.status === 'completed') {
          console.log('✅ Generation completed:', jobId);
          return status;
        }

        if (status.status === 'failed') {
          throw new Error(status.error_message || 'Generation failed');
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        attempts++;

      } catch (error) {
        console.error('❌ Error polling generation status:', error);
        throw error;
      }
    }

    throw new Error('Generation polling timeout');
  }

  /**
   * Extract keyframe from video at specific timestamp
   */
  async extractKeyframe(videoElement: HTMLVideoElement, timestamp: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      const originalTime = videoElement.currentTime;

      videoElement.currentTime = timestamp;

      videoElement.onseeked = () => {
        try {
          canvas.width = Math.min(videoElement.videoWidth, 640);
          canvas.height = Math.min(videoElement.videoHeight, 360);

          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          const base64Data = canvas.toDataURL('image/jpeg', 0.8);

          // Restore original time
          videoElement.currentTime = originalTime;

          resolve(base64Data);
        } catch (error) {
          reject(error);
        }
      };

      videoElement.onerror = () => {
        reject(new Error('Failed to seek video'));
      };
    });
  }
}

// Export singleton instance
export const videoGenerationService = VideoGenerationService.getInstance();