/**
 * Image Generation Service Client
 * Handles communication with the Vision8 backend image generation API
 */

interface ImageGenerationRequest {
  image_id: string;
  prompt: string;
  model?: string;
  quality?: string;
  style_settings?: Record<string, any>;
  reference_image?: string;
  user_api_key?: string;
}

interface ImageGenerationResponse {
  job_id: string;
  status: string;
  message: string;
  estimated_completion_seconds?: number;
  generation_url?: string;
}

interface ImageGenerationStatus {
  job_id: string;
  status: string;
  progress: number;
  generation_url?: string;
  file_size?: number;
  error_message?: string;
  created_at: number;
  completed_at?: number;
}

interface ImageMetadata {
  image_id: string;
  storage_path: string;
  base64?: string;
}

class ImageGenerationService {
  private backendUrl: string;

  constructor(backendUrl: string = import.meta.env?.VITE_API_BASE_URL || '/api/v1') {
    this.backendUrl = backendUrl;
  }

  /**
   * Generate an image using AI
   */
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    try {
      const response = await fetch(`${this.backendUrl}/api/image-generation/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_id: request.image_id,
          prompt: request.prompt,
          model: request.model || 'imagen3',
          quality: request.quality || 'standard',
          style_settings: request.style_settings,
          reference_image: request.reference_image,
          user_api_key: request.user_api_key,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `Image generation failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Image generation error:', error);
      throw error;
    }
  }

  /**
   * Get the status of an image generation job
   */
  async getGenerationStatus(jobId: string): Promise<ImageGenerationStatus> {
    try {
      const response = await fetch(`${this.backendUrl}/api/image-generation/status/${jobId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `Failed to get status: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get generation status:', error);
      throw error;
    }
  }

  /**
   * Poll for generation status with intervals
   */
  async pollGenerationStatus(
    jobId: string,
    maxAttempts: number = 60,
    intervalMs: number = 1000
  ): Promise<ImageGenerationStatus> {
    let attempts = 0;

    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          attempts++;
          const status = await this.getGenerationStatus(jobId);

          if (status.status === 'completed' || status.status === 'error') {
            clearInterval(interval);
            resolve(status);
          } else if (attempts >= maxAttempts) {
            clearInterval(interval);
            reject(new Error(`Generation timeout after ${maxAttempts} attempts`));
          }
        } catch (error) {
          clearInterval(interval);
          reject(error);
        }
      }, intervalMs);
    });
  }

  /**
   * Upload a reference image
   */
  async uploadReferenceImage(
    file: File,
    imageType: string = 'reference'
  ): Promise<ImageMetadata> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('image_type', imageType);

      const response = await fetch(`${this.backendUrl}/api/image-generation/upload-reference`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        image_id: result.image_id,
        storage_path: result.storage_path,
        base64: result.base64,
      };
    } catch (error) {
      console.error('Image upload error:', error);
      throw error;
    }
  }

  /**
   * Get supported models and quality presets
   */
  async getSupportedModels(): Promise<{
    models: string[];
    quality_presets: Record<string, any>;
    default_model: string;
    default_quality: string;
  }> {
    try {
      const response = await fetch(`${this.backendUrl}/api/image-generation/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `Failed to get models: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        models: result.models,
        quality_presets: result.quality_presets,
        default_model: result.default_model,
        default_quality: result.default_quality,
      };
    } catch (error) {
      console.error('Failed to get supported models:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const imageGenerationService = new ImageGenerationService();

// Export types
export type {
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationStatus,
  ImageMetadata,
};
