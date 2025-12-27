/**
 * Standardized MUX Thumbnail Generation Utilities
 * 
 * Centralizes thumbnail URL generation with consistent dimensions and parameters
 * across all Vision8 components (Analysis Panel, History Sidebar, Scene Previews, etc.)
 */

export type ThumbnailUsageType = 'analysis' | 'sidebar' | 'hover' | 'full';

export interface ThumbnailConfig {
  width: number;
  height: number;
  fitMode: 'smartcrop' | 'crop' | 'pad' | 'stretch';
  quality: number;
}

/**
 * Standardized thumbnail configurations for different UI contexts
 */
export const THUMBNAIL_CONFIGS: Record<ThumbnailUsageType, ThumbnailConfig> = {
  // Scene grid in Analysis Panel - primary display
  analysis: {
    width: 320,
    height: 180,
    fitMode: 'smartcrop',
    quality: 95,
  },
  // Compact thumbnails in History Sidebar
  sidebar: {
    width: 80,
    height: 56,
    fitMode: 'smartcrop',
    quality: 90,
  },
  // Medium preview on hover/tooltip
  hover: {
    width: 240,
    height: 135,
    fitMode: 'smartcrop',
    quality: 95,
  },
  // Full-size detailed scene view
  full: {
    width: 480,
    height: 270,
    fitMode: 'smartcrop',
    quality: 98,
  },
};

/**
 * Get standardized dimensions for a thumbnail usage type
 * @param usageType - The context in which thumbnail is used
 * @returns Object with width and height
 */
export function getThumbnailDimensions(usageType: ThumbnailUsageType = 'analysis') {
  const config = THUMBNAIL_CONFIGS[usageType];
  return {
    width: config.width,
    height: config.height,
  };
}

/**
 * Generate a standardized MUX thumbnail URL
 * 
 * @param playbackId - MUX playback ID (required)
 * @param timestamp - Timestamp in seconds to capture thumbnail
 * @param usageType - Context of usage (analysis, sidebar, hover, full)
 * @returns Complete Mux thumbnail URL
 * 
 * @example
 * const url = generateThumbnailUrl('playback-id-123', 42.5, 'analysis');
 * // Returns: https://image.mux.com/playback-id-123/thumbnail.png?time=42.5&width=320&height=180&fit_mode=smartcrop&quality=95
 */
export function generateThumbnailUrl(
  playbackId: string,
  timestamp: number,
  usageType: ThumbnailUsageType = 'analysis'
): string {
  if (!playbackId) {
    throw new Error('playbackId is required for thumbnail generation');
  }

  const config = THUMBNAIL_CONFIGS[usageType];
  const params = new URLSearchParams({
    time: timestamp.toString(),
    width: config.width.toString(),
    height: config.height.toString(),
    fit_mode: config.fitMode,
    quality: config.quality.toString(),
  });

  return `https://image.mux.com/${playbackId}/thumbnail.png?${params.toString()}`;
}

/**
 * Validate if a playback ID exists before generating thumbnail
 * Prevents unnecessary API calls with null/undefined IDs
 */
export function hasThumbnailSupport(playbackId?: string | null): boolean {
  return !!playbackId && typeof playbackId === 'string' && playbackId.length > 0;
}
