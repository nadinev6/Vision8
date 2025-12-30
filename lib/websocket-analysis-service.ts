/**
 * WebSocket service for real-time video analysis streaming
 * Provides progressive fallback mechanisms based on device capabilities
 */

import { AnalysisFrame, AnalysisResults, ClientCapabilities } from './video-analysis-service';

export interface WebSocketAnalysisConfig {
  wsUrl?: string;
  reconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  bufferSize: number;
  compressionEnabled: boolean;
}

export interface AnalysisStreamMessage {
  type: 'frame' | 'progress' | 'complete' | 'error' | 'heartbeat' | 'capabilities';
  data: any;
  timestamp: number;
  sessionId: string;
}

export interface FallbackStrategy {
  name: string;
  priority: number;
  description: string;
  checkCapabilities: (capabilities: ClientCapabilities) => boolean;
  getConfig: () => any;
}

export class WebSocketAnalysisService {
  private ws: WebSocket | null = null;
  private config: WebSocketAnalysisConfig;
  private reconnectAttempts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private messageQueue: AnalysisStreamMessage[] = [];
  private isConnected = false;
  private sessionId: string | null = null;
  private capabilities: ClientCapabilities | null = null;

  // Fallback strategies in order of priority
  private fallbackStrategies: FallbackStrategy[] = [
    {
      name: 'realtime_tensorflow',
      priority: 1,
      description: 'Real-time TensorFlow.js COCO-SSD analysis',
      checkCapabilities: (caps) => caps.hasWebGL || caps.hasWebAssembly,
      getConfig: () => ({
        quality: 'high',
        targetFps: 10,
        scoreThreshold: 0.5,
        maxDetections: 20
      })
    },
    {
      name: 'batch_tensorflow',
      priority: 2,
      description: 'Batch TensorFlow.js analysis with lower FPS',
      checkCapabilities: (caps) => caps.hasWebAssembly,
      getConfig: () => ({
        quality: 'medium',
        targetFps: 3,
        scoreThreshold: 0.6,
        maxDetections: 15
      })
    },
    {
      name: 'basic_detection',
      priority: 3,
      description: 'Basic object detection with reduced scope',
      checkCapabilities: (caps) => caps.memoryLimit > 256 * 1024 * 1024,
      getConfig: () => ({
        quality: 'low',
        targetFps: 1,
        scoreThreshold: 0.7,
        maxDetections: 10
      })
    },
    {
      name: 'server_analysis',
      priority: 4,
      description: 'Server-side analysis via WebSocket',
      checkCapabilities: () => true,
      getConfig: () => ({
        quality: 'server',
        uploadFrames: true,
        batchSize: 5
      })
    }
  ];

  constructor(config: Partial<WebSocketAnalysisConfig> = {}) {
    this.config = {
      wsUrl: config.wsUrl || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/mux/ws/analysis`,
      reconnectAttempts: config.reconnectAttempts || 5,
      reconnectDelay: config.reconnectDelay || 1000,
      heartbeatInterval: config.heartbeatInterval || 30000,
      bufferSize: config.bufferSize || 100,
      compressionEnabled: config.compressionEnabled || true,
      ...config
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(sessionId: string, capabilities: ClientCapabilities): Promise<void> {
    this.sessionId = sessionId;
    this.capabilities = capabilities;

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${this.config.wsUrl}/${sessionId}`;
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('🔗 WebSocket connected for analysis streaming');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.sendCapabilities();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: AnalysisStreamMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('🔌 WebSocket disconnected');
          this.isConnected = false;
          this.stopHeartbeat();
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send analysis frame to server
   */
  sendFrame(frame: AnalysisFrame): void {
    if (!this.isConnected || !this.ws) {
      // Queue message for when connection is restored
      this.messageQueue.push({
        type: 'frame',
        data: frame,
        timestamp: Date.now(),
        sessionId: this.sessionId!
      });
      return;
    }

    const message: AnalysisStreamMessage = {
      type: 'frame',
      data: frame,
      timestamp: Date.now(),
      sessionId: this.sessionId!
    };

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send frame:', error);
      // Queue for retry
      this.messageQueue.push(message);
    }
  }

  /**
   * Send analysis progress update
   */
  sendProgress(progress: number, message?: string): void {
    if (!this.isConnected || !this.ws) return;

    const progressMessage: AnalysisStreamMessage = {
      type: 'progress',
      data: { progress, message },
      timestamp: Date.now(),
      sessionId: this.sessionId!
    };

    try {
      this.ws.send(JSON.stringify(progressMessage));
    } catch (error) {
      console.error('Failed to send progress:', error);
    }
  }

  /**
   * Send analysis complete message
   */
  sendComplete(results: AnalysisResults): void {
    if (!this.isConnected || !this.ws) return;

    const completeMessage: AnalysisStreamMessage = {
      type: 'complete',
      data: results,
      timestamp: Date.now(),
      sessionId: this.sessionId!
    };

    try {
      this.ws.send(JSON.stringify(completeMessage));
    } catch (error) {
      console.error('Failed to send completion:', error);
    }
  }

  /**
   * Send error message
   */
  sendError(error: string, details?: any): void {
    if (!this.isConnected || !this.ws) return;

    const errorMessage: AnalysisStreamMessage = {
      type: 'error',
      data: { error, details },
      timestamp: Date.now(),
      sessionId: this.sessionId!
    };

    try {
      this.ws.send(JSON.stringify(errorMessage));
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: AnalysisStreamMessage): void {
    switch (message.type) {
      case 'heartbeat':
        // Respond to server heartbeat
        this.sendHeartbeat();
        break;
      case 'frame':
        // Process server-sent frame analysis
        this.handleServerFrame(message.data);
        break;
      case 'progress':
        // Handle server progress updates
        this.handleServerProgress(message.data);
        break;
      case 'complete':
        // Handle analysis completion
        this.handleServerComplete(message.data);
        break;
      case 'error':
        // Handle server errors
        this.handleServerError(message.data);
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Send heartbeat message
   */
  private sendHeartbeat(): void {
    if (!this.isConnected || !this.ws) return;

    const heartbeatMessage: AnalysisStreamMessage = {
      type: 'heartbeat',
      data: { timestamp: Date.now() },
      timestamp: Date.now(),
      sessionId: this.sessionId!
    };

    try {
      this.ws.send(JSON.stringify(heartbeatMessage));
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }

  /**
   * Send client capabilities to server
   */
  private sendCapabilities(): void {
    if (!this.capabilities || !this.isConnected || !this.ws) return;

    const capabilitiesMessage: AnalysisStreamMessage = {
      type: 'capabilities',
      data: this.capabilities,
      timestamp: Date.now(),
      sessionId: this.sessionId!
    };

    try {
      this.ws.send(JSON.stringify(capabilitiesMessage));
    } catch (error) {
      console.error('Failed to send capabilities:', error);
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.reconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this.sessionId && this.capabilities) {
        this.connect(this.sessionId, this.capabilities).catch(error => {
          console.error('Reconnection failed:', error);
        });
      }
    }, delay);
  }

  /**
   * Select best fallback strategy based on capabilities
   */
  selectFallbackStrategy(capabilities: ClientCapabilities): FallbackStrategy {
    const availableStrategies = this.fallbackStrategies
      .filter(strategy => strategy.checkCapabilities(capabilities))
      .sort((a, b) => a.priority - b.priority);

    if (availableStrategies.length === 0) {
      // Fall back to server analysis as last resort
      return this.fallbackStrategies[this.fallbackStrategies.length - 1];
    }

    return availableStrategies[0];
  }

  /**
   * Get fallback configuration for selected strategy
   */
  getFallbackConfig(strategy: FallbackStrategy): any {
    return strategy.getConfig();
  }

  /**
   * Handle server-sent frame analysis
   */
  private handleServerFrame(frame: AnalysisFrame): void {
    // This would be called when server sends frame analysis results
    // Could be used for enhanced analysis or verification
    console.log('Received server frame analysis:', frame);
  }

  /**
   * Handle server progress updates
   */
  private handleServerProgress(progressData: { progress: number; message?: string }): void {
    // Handle server-side progress updates
    console.log('Server progress:', progressData);
  }

  /**
   * Handle analysis completion from server
   */
  private handleServerComplete(results: AnalysisResults): void {
    // Handle server-side analysis completion
    console.log('Server analysis complete:', results);
  }

  /**
   * Handle server errors
   */
  private handleServerError(errorData: { error: string; details?: any }): void {
    console.error('Server error:', errorData);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.sessionId = null;
    this.capabilities = null;
    this.messageQueue = [];
    
    console.log('WebSocket analysis service disconnected');
  }

  /**
   * Get connection status
   */
  getStatus(): {
    isConnected: boolean;
    sessionId: string | null;
    reconnectAttempts: number;
    queueSize: number;
  } {
    return {
      isConnected: this.isConnected,
      sessionId: this.sessionId,
      reconnectAttempts: this.reconnectAttempts,
      queueSize: this.messageQueue.length
    };
  }

  /**
   * Flush queued messages
   */
  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      if (message && this.ws) {
        try {
          this.ws.send(JSON.stringify(message));
        } catch (error) {
          console.error('Failed to flush queued message:', error);
          // Re-queue the message
          this.messageQueue.unshift(message);
          break;
        }
      }
    }
  }
}

/**
 * Progressive Analysis Manager
 * Manages analysis with automatic fallback based on performance and capabilities
 */
export class ProgressiveAnalysisManager {
  private wsService: WebSocketAnalysisService;
  private currentStrategy: FallbackStrategy | null = null;
  private performanceMonitor: PerformanceMonitor;
  private isServerAnalysis = false;

  constructor() {
    this.wsService = new WebSocketAnalysisService();
    this.performanceMonitor = new PerformanceMonitor();
  }

  /**
   * Start progressive analysis
   */
  async startProgressiveAnalysis(
    sessionId: string,
    capabilities: ClientCapabilities,
    onFrame: (frame: AnalysisFrame) => void,
    onProgress: (progress: number, message: string) => void,
    onComplete: (results: AnalysisResults) => void,
    onError: (error: string) => void
  ): Promise<void> {
    try {
      // Select best strategy based on capabilities
      this.currentStrategy = this.wsService.selectFallbackStrategy(capabilities);
      const config = this.wsService.getFallbackConfig(this.currentStrategy);
      
      console.log(`Selected analysis strategy: ${this.currentStrategy.name}`);
      onProgress(0, `Starting ${this.currentStrategy.description}`);

      // Connect to WebSocket for server coordination
      await this.wsService.connect(sessionId, capabilities);

      // Start performance monitoring
      this.performanceMonitor.start();

      if (this.currentStrategy.name === 'server_analysis') {
        // Use server-side analysis
        this.isServerAnalysis = true;
        await this.startServerAnalysis(sessionId, onFrame, onProgress, onComplete, onError);
      } else {
        // Use client-side analysis with fallback monitoring
        await this.startClientAnalysis(sessionId, config, onFrame, onProgress, onComplete, onError);
      }

    } catch (error) {
      console.error('Progressive analysis failed:', error);
      onError(error instanceof Error ? error.message : 'Analysis failed');
    }
  }

  /**
   * Start server-side analysis
   */
  private async startServerAnalysis(
    sessionId: string,
    onFrame: (frame: AnalysisFrame) => void,
    onProgress: (progress: number, message: string) => void,
    onComplete: (results: AnalysisResults) => void,
    onError: (error: string) => void
  ): Promise<void> {
    // This would implement server-side analysis coordination
    onProgress(10, 'Server analysis started');
    
    // Set up WebSocket message handlers for server analysis
    // Implementation would depend on server capabilities
  }

  /**
   * Start client-side analysis with fallback monitoring
   */
  private async startClientAnalysis(
    sessionId: string,
    config: any,
    onFrame: (frame: AnalysisFrame) => void,
    onProgress: (progress: number, message: string) => void,
    onComplete: (results: AnalysisResults) => void,
    onError: (error: string) => void
  ): Promise<void> {
    // Monitor performance and implement fallback if needed
    const performanceCheck = setInterval(() => {
      const performance = this.performanceMonitor.getPerformance();
      
      if (performance.fps < config.targetFps * 0.5) {
        console.warn('Performance degraded, considering fallback');
        // Implement fallback logic here
      }
    }, 5000);

    // Clean up performance monitoring on completion
    setTimeout(() => {
      clearInterval(performanceCheck);
    }, 300000); // 5 minutes max
  }

  /**
   * Stop progressive analysis
   */
  stop(): void {
    this.wsService.disconnect();
    this.performanceMonitor.stop();
  }
}

/**
 * Performance Monitor
 * Tracks analysis performance for fallback decisions
 */
class PerformanceMonitor {
  private frames = 0;
  private startTime = 0;
  private interval: NodeJS.Timeout | null = null;

  start(): void {
    this.frames = 0;
    this.startTime = Date.now();
    
    this.interval = setInterval(() => {
      this.frames++;
    }, 100);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getPerformance(): { fps: number; elapsed: number } {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const fps = elapsed > 0 ? this.frames / elapsed : 0;
    
    return { fps, elapsed };
  }
}

// Export singleton instance
export const websocketAnalysisService = new WebSocketAnalysisService();
export const progressiveAnalysisManager = new ProgressiveAnalysisManager();