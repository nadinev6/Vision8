import { supabase } from '../supabaseClient';

/**
 * Client-side video analysis service using TensorFlow.js COCO-SSD model
 * Provides real-time object detection and scene analysis capabilities
 */

// TensorFlow.js imports - loaded dynamically for performance
let tf: any = null;
let cocoSsd: any = null;

// Analysis configuration
export interface AnalysisConfig {
  modelUrl?: string;
  scoreThreshold: number;
  maxDetections: number;
  targetFps: number;
  qualityLevel: 'low' | 'medium' | 'high';
  deviceCapabilities: {
    hasWebGL: boolean;
    hasWebAssembly: boolean;
    memoryLimit: number;
    gpuAvailable: boolean;
  };
}

export interface DetectedObject {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

export interface AnalysisFrame {
  timestamp: number;
  objects: DetectedObject[];
  sceneDescription?: string;
  keyframe: boolean;
  thumbnailData?: string;
}

export interface AnalysisSession {
  sessionId: string;
  videoElement: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  model: any;
  isAnalyzing: boolean;
  currentFrame: number;
  totalFrames: number;
  detectedObjects: AnalysisFrame[];
  scenes: Array<{
    timestamp: number;
    description: string;
    objects: DetectedObject[];
    keyframe: boolean;
  }>;
  config: AnalysisConfig;
  onProgress?: (progress: number) => void;
  onFrame?: (frame: AnalysisFrame) => void;
  onComplete?: (results: AnalysisResults) => void;
}

export interface AnalysisResults {
  sessionId: string;
  duration: number;
  totalFrames: number;
  analyzedFrames: number;
  detectedObjects: DetectedObject[];
  scenes: Array<{
    timestamp: number;
    description: string;
    objects: DetectedObject[];
    keyframe: boolean;
  }>;
  transcripts: Array<{
    startTime: number;
    endTime: number;
    text: string;
    confidence: number;
  }>;
  summary: {
    objectCount: number;
    sceneCount: number;
    processingTime: number;
    qualityScore: number;
  };
}

export interface ClientCapabilities {
  hasWebGL: boolean;
  hasWebAssembly: boolean;
  hasOffscreenCanvas: boolean;
  memoryLimit: number;
  gpuAvailable: boolean;
  recommendedQuality: 'low' | 'medium' | 'high';
}

class VideoAnalysisService {
  private sessions: Map<string, AnalysisSession> = new Map();
  private isInitialized = false;

  /**
   * Detect client capabilities for adaptive analysis
   */
  async detectCapabilities(): Promise<ClientCapabilities> {
    const capabilities: ClientCapabilities = {
      hasWebGL: false,
      hasWebAssembly: false,
      hasOffscreenCanvas: false,
      memoryLimit: 0,
      gpuAvailable: false,
      recommendedQuality: 'medium'
    };

    try {
      // WebGL detection
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      capabilities.hasWebGL = !!gl;
      if (gl) {
        capabilities.gpuAvailable = true;
      }

      // WebAssembly detection
      capabilities.hasWebAssembly = typeof WebAssembly === 'object' && 
        typeof WebAssembly.instantiate === 'function';

      // OffscreenCanvas detection
      capabilities.hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';

      // Memory estimation
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        capabilities.memoryLimit = memory.jsHeapSizeLimit || 512 * 1024 * 1024; // 512MB default
      }

      // Determine recommended quality
      if (capabilities.gpuAvailable && capabilities.hasWebAssembly) {
        capabilities.recommendedQuality = 'high';
      } else if (capabilities.hasWebGL) {
        capabilities.recommendedQuality = 'medium';
      } else {
        capabilities.recommendedQuality = 'low';
      }

    } catch (error) {
      console.warn('Capability detection failed:', error);
    }

    return capabilities;
  }

  /**
   * Initialize TensorFlow.js and COCO-SSD model
   */
  async initialize(config?: Partial<AnalysisConfig>): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🔄 Initializing TensorFlow.js and COCO-SSD model...');

      // Dynamic imports for better performance
      const [{ default: tfjs }, cocoSsdModule] = await Promise.all([
        import('@tensorflow/tfjs'),
        import('@tensorflow-models/coco-ssd')
      ]);

      tf = tfjs;
      cocoSsd = cocoSsdModule;

      // Configure TensorFlow.js backend based on capabilities
      const capabilities = await this.detectCapabilities();
      
      if (capabilities.gpuAvailable) {
        try {
          await tf.setBackend('webgl');
          console.log('✅ Using WebGL backend for GPU acceleration');
        } catch {
          await tf.setBackend('wasm');
          console.log('✅ Using WebAssembly backend as fallback');
        }
      } else {
        await tf.setBackend('cpu');
        console.log('✅ Using CPU backend');
      }

      await tf.ready();

      // Warm up the model
      const warmupCanvas = document.createElement('canvas');
      warmupCanvas.width = 224;
      warmupCanvas.height = 224;
      const warmupTensor = tf.browser.fromPixels(warmupCanvas);
      warmupTensor.dispose();

      this.isInitialized = true;
      console.log('✅ Video analysis service initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize video analysis service:', error);
      throw new Error(`Analysis service initialization failed: ${error.message}`);
    }
  }

  /**
   * Create a new analysis session
   */
  async createSession(
    videoElement: HTMLVideoElement,
    config: Partial<AnalysisConfig> = {}
  ): Promise<string> {
    await this.initialize();

    const capabilities = await this.detectCapabilities();
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Merge config with defaults and capabilities
    const analysisConfig: AnalysisConfig = {
      modelUrl: 'https://tfhub.dev/tensorflow/ssd_mobilenet_v2/2',
      scoreThreshold: 0.5,
      maxDetections: 10,
      targetFps: 5,
      qualityLevel: config.qualityLevel || capabilities.recommendedQuality,
      deviceCapabilities: capabilities,
      ...config
    };

    // Create canvas for frame capture
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Load the COCO-SSD model
    const model = await cocoSsd.load({
      base: analysisConfig.qualityLevel === 'high' ? 'mobilenet_v2' : 'lite_mobilenet_v2'
    });

    const session: AnalysisSession = {
      sessionId,
      videoElement,
      canvas,
      model,
      isAnalyzing: false,
      currentFrame: 0,
      totalFrames: 0,
      detectedObjects: [],
      scenes: [],
      config: analysisConfig,
    };

    this.sessions.set(sessionId, session);
    console.log(`📊 Created analysis session: ${sessionId}`);

    return sessionId;
  }

  /**
   * Analyze a single video frame
   */
  private async analyzeFrame(session: AnalysisSession): Promise<AnalysisFrame | null> {
    const { videoElement, canvas, model, config } = session;

    if (videoElement.paused || videoElement.ended) {
      return null;
    }

    try {
      // Set canvas size to match video
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      // Draw current frame to canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      // Get image data for analysis
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Run object detection
      const predictions = await model.detect(canvas, config.maxDetections);
      
      // Filter predictions by score threshold
      const objects = predictions
        .filter((pred: any) => pred.score >= config.scoreThreshold)
        .map((pred: any) => ({
          class: pred.class,
          score: pred.score,
          bbox: pred.bbox as [number, number, number, number]
        }));

      // Generate scene description based on detected objects
      const sceneDescription = this.generateSceneDescription(objects);
      
      // Determine if this is a keyframe
      const keyframe = this.isKeyframe(objects, session.scenes);

      const frame: AnalysisFrame = {
        timestamp: videoElement.currentTime,
        objects,
        sceneDescription,
        keyframe,
      };

      // Generate thumbnail for keyframes
      if (keyframe) {
        frame.thumbnailData = canvas.toDataURL('image/jpeg', 0.8);
      }

      session.currentFrame++;
      return frame;

    } catch (error) {
      console.error('Frame analysis error:', error);
      return null;
    }
  }

  /**
   * Generate scene description from detected objects
   */
  private generateSceneDescription(objects: DetectedObject[]): string {
    if (objects.length === 0) return 'Empty scene';

    // Group objects by type and count
    const objectCounts: Record<string, number> = {};
    objects.forEach(obj => {
      objectCounts[obj.class] = (objectCounts[obj.class] || 0) + 1;
    });

    // Generate description based on dominant objects
    const sortedObjects = Object.entries(objectCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    const descriptions = sortedObjects.map(([obj, count]) => {
      if (count === 1) return obj;
      return `${count} ${obj}${count > 1 ? 's' : ''}`;
    });

    return `Scene contains: ${descriptions.join(', ')}`;
  }

  /**
   * Determine if frame is a keyframe based on object changes
   */
  private isKeyframe(objects: DetectedObject[], previousScenes: any[]): boolean {
    if (previousScenes.length === 0) return true;

    const lastScene = previousScenes[previousScenes.length - 1];
    const lastObjects = new Set(lastScene.objects.map((obj: any) => obj.class));
    const currentObjects = new Set(objects.map(obj => obj.class));

    // Check for significant object changes
    const newObjects = [...currentObjects].filter(obj => !lastObjects.has(obj));
    const removedObjects = [...lastObjects].filter(obj => !currentObjects.has(obj));

    // Consider it a keyframe if there are significant changes
    return newObjects.length > 0 || removedObjects.length > 0 || objects.length === 0;
  }

  /**
   * Start real-time video analysis
   */
  async startAnalysis(
    sessionId: string,
    callbacks?: {
      onProgress?: (progress: number) => void;
      onFrame?: (frame: AnalysisFrame) => void;
      onComplete?: (results: AnalysisResults) => void;
    }
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.isAnalyzing = true;
    session.onProgress = callbacks?.onProgress;
    session.onFrame = callbacks?.onFrame;
    session.onComplete = callbacks?.onComplete;

    const { videoElement, config } = session;

    // Calculate total frames
    session.totalFrames = Math.floor(videoElement.duration * config.targetFps);
    
    const startTime = Date.now();
    let frameCount = 0;

    console.log(`🎬 Starting analysis with ${session.totalFrames} frames`);

    return new Promise((resolve, reject) => {
      const analyzeNextFrame = async () => {
        if (!session.isAnalyzing) {
          resolve();
          return;
        }

        try {
          const frame = await this.analyzeFrame(session);
          
          if (frame) {
            session.detectedObjects.push(frame);
            
            // Check if it's a keyframe and add to scenes
            if (frame.keyframe) {
              session.scenes.push({
                timestamp: frame.timestamp,
                description: frame.sceneDescription || '',
                objects: frame.objects,
                keyframe: true
              });
            }

            // Call frame callback
            if (session.onFrame) {
              session.onFrame(frame);
            }
          }

          frameCount++;
          const progress = (frameCount / session.totalFrames) * 100;

          // Update progress
          if (session.onProgress) {
            session.onProgress(progress);
          }

          // Check if analysis is complete
          if (videoElement.ended || frameCount >= session.totalFrames) {
            session.isAnalyzing = false;
            
            const results = await this.generateResults(session, startTime);
            
            if (session.onComplete) {
              session.onComplete(results);
            }
            
            resolve();
            return;
          }

          // Schedule next frame based on target FPS
          const delay = 1000 / config.targetFps;
          setTimeout(analyzeNextFrame, delay);

        } catch (error) {
          console.error('Analysis error:', error);
          session.isAnalyzing = false;
          reject(error);
        }
      };

      // Start analysis
      if (videoElement.readyState >= 2) {
        analyzeNextFrame();
      } else {
        videoElement.addEventListener('loadeddata', () => {
          analyzeNextFrame();
        }, { once: true });
      }
    });
  }

  /**
   * Generate comprehensive analysis results
   */
  private async generateResults(session: AnalysisSession, startTime: number): Promise<AnalysisResults> {
    const processingTime = Date.now() - startTime;
    
    // Aggregate all detected objects
    const allObjects = session.detectedObjects.flatMap(frame => frame.objects);
    
    // Calculate quality score based on detection confidence and coverage
    const avgConfidence = allObjects.reduce((sum, obj) => sum + obj.score, 0) / allObjects.length || 0;
    const qualityScore = Math.min(100, (avgConfidence * 100) + (session.scenes.length * 5));

    return {
      sessionId: session.sessionId,
      duration: session.videoElement.duration,
      totalFrames: session.totalFrames,
      analyzedFrames: session.detectedObjects.length,
      detectedObjects: allObjects,
      scenes: session.scenes,
      transcripts: [], // Would be populated by audio analysis
      summary: {
        objectCount: allObjects.length,
        sceneCount: session.scenes.length,
        processingTime,
        qualityScore: Math.round(qualityScore)
      }
    };
  }

  /**
   * Pause analysis
   */
  pauseAnalysis(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isAnalyzing = false;
    }
  }

  /**
   * Resume analysis
   */
  resumeAnalysis(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && !session.isAnalyzing) {
      session.isAnalyzing = true;
      this.startAnalysis(sessionId);
    }
  }

  /**
   * Stop analysis and cleanup
   */
  stopAnalysis(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isAnalyzing = false;
      this.sessions.delete(sessionId);
      console.log(`🛑 Stopped analysis session: ${sessionId}`);
    }
  }

  /**
   * Get analysis progress
   */
  getProgress(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session || session.totalFrames === 0) return 0;
    
    return (session.currentFrame / session.totalFrames) * 100;
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId: string): {
    isAnalyzing: boolean;
    progress: number;
    frameCount: number;
    sceneCount: number;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      isAnalyzing: session.isAnalyzing,
      progress: this.getProgress(sessionId),
      frameCount: session.currentFrame,
      sceneCount: session.scenes.length
    };
  }

  /**
   * Export analysis results to Supabase
   */
  async exportResults(
    sessionId: string,
    userId: string,
    videoMetadata: {
      asset_id?: string;
      playback_id?: string;
      title: string;
      duration: number;
    }
  ): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const results = await this.generateResults(session, Date.now());

    try {
      // Save analysis results to Supabase
      const { data, error } = await supabase
        .from('video_analysis_results')
        .insert({
          user_id: userId,
          session_id: sessionId,
          video_metadata: videoMetadata,
          analysis_results: results,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (error) throw error;

      console.log(`💾 Analysis results exported: ${data.id}`);
      return data.id;

    } catch (error) {
      console.error('Failed to export results:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.sessions.forEach((session, sessionId) => {
      this.stopAnalysis(sessionId);
    });
    
    if (tf && tf.disposeVariables) {
      tf.disposeVariables();
    }
    
    this.isInitialized = false;
    console.log('🧹 Video analysis service disposed');
  }
}

// Export singleton instance
export const videoAnalysisService = new VideoAnalysisService();

// React hook for video analysis
export function useVideoAnalysis() {
  return {
    videoAnalysisService,
    ClientCapabilities,
    AnalysisConfig,
    DetectedObject,
    AnalysisFrame,
    AnalysisSession,
    AnalysisResults
  };
}