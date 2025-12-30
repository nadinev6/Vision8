import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '../lib/utils';
import { videoAnalysisService, AnalysisFrame, AnalysisResults } from '../lib/video-analysis-service';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { 
  PlayIcon, 
  PauseIcon, 
  StopIcon, 
  AnalysisIcon, 
  WebcamIcon, 
  SettingsIcon,
  AlertCircleIcon,
  CheckCircleIcon
} from './icons';

interface EnhancedVideoPlayerProps {
  title?: string;
  src?: string | null;
  playbackId?: string | null;
  className?: string;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onAnalysisComplete?: (results: AnalysisResults) => void;
  onFrameAnalyzed?: (frame: AnalysisFrame) => void;
  autoAnalyze?: boolean;
  analysisQuality?: 'low' | 'medium' | 'high';
  enableRealTimeAnalysis?: boolean;
}

interface AnalysisState {
  isAnalyzing: boolean;
  progress: number;
  currentFrame: number;
  totalFrames: number;
  detectedObjects: number;
  scenes: number;
  qualityScore: number;
  error: string | null;
}

interface DeviceCapabilities {
  hasWebGL: boolean;
  hasWebAssembly: boolean;
  memoryLimit: number;
  gpuAvailable: boolean;
  recommendedQuality: 'low' | 'medium' | 'high';
}

const EnhancedVideoPlayer = React.forwardRef<HTMLVideoElement, EnhancedVideoPlayerProps>(({
  title = "Enhanced Video Player",
  src,
  playbackId,
  className,
  onTimeUpdate,
  onDurationChange,
  onAnalysisComplete,
  onFrameAnalyzed,
  autoAnalyze = false,
  analysisQuality = 'medium',
  enableRealTimeAnalysis = true
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  
  // Analysis state
  const [analysisState, setAnalysisState] = useState<AnalysisState>({
    isAnalyzing: false,
    progress: 0,
    currentFrame: 0,
    totalFrames: 0,
    detectedObjects: 0,
    scenes: 0,
    qualityScore: 0,
    error: null
  });
  
  // Device capabilities
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [analysisEnabled, setAnalysisEnabled] = useState(false);

  // Initialize device capabilities
  useEffect(() => {
    const initCapabilities = async () => {
      try {
        const detectedCapabilities = await videoAnalysisService.detectCapabilities();
        setCapabilities(detectedCapabilities);
        
        // Auto-enable analysis if device is capable
        const canAnalyze = detectedCapabilities.hasWebGL || detectedCapabilities.hasWebAssembly;
        setAnalysisEnabled(canAnalyze && enableRealTimeAnalysis);
        
        console.log('Device capabilities:', detectedCapabilities);
      } catch (error) {
        console.warn('Failed to detect capabilities:', error);
      }
    };
    
    initCapabilities();
  }, [enableRealTimeAnalysis]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      onTimeUpdate?.(time);
    }
  }, [onTimeUpdate]);

  const handleDurationChange = useCallback(() => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      onDurationChange?.(dur);
    }
  }, [onDurationChange]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    // Stop analysis if running
    if (sessionIdRef.current) {
      stopAnalysis();
    }
  }, []);

  // Analysis controls
  const startAnalysis = useCallback(async () => {
    if (!videoRef.current || !analysisEnabled) return;

    try {
      setAnalysisState(prev => ({ ...prev, isAnalyzing: true, error: null }));
      
      // Create analysis session
      const sessionId = await videoAnalysisService.createSession(videoRef.current, {
        qualityLevel: analysisQuality,
        scoreThreshold: 0.5,
        targetFps: 5
      });
      
      sessionIdRef.current = sessionId;
      
      // Start analysis with callbacks
      await videoAnalysisService.startAnalysis(sessionId, {
        onProgress: (progress) => {
          setAnalysisState(prev => ({ ...prev, progress }));
        },
        onFrame: (frame) => {
          setAnalysisState(prev => ({ 
            ...prev, 
            currentFrame: prev.currentFrame + 1,
            detectedObjects: frame.objects.length 
          }));
          onFrameAnalyzed?.(frame);
        },
        onComplete: (results) => {
          setAnalysisState(prev => ({
            ...prev,
            isAnalyzing: false,
            progress: 100,
            scenes: results.scenes.length,
            qualityScore: results.summary.qualityScore
          }));
          onAnalysisComplete?.(results);
        }
      });
      
    } catch (error) {
      console.error('Analysis failed:', error);
      setAnalysisState(prev => ({ 
        ...prev, 
        isAnalyzing: false, 
        error: error instanceof Error ? error.message : 'Analysis failed' 
      }));
    }
  }, [analysisEnabled, analysisQuality, onFrameAnalyzed, onAnalysisComplete]);

  const stopAnalysis = useCallback(() => {
    if (sessionIdRef.current) {
      videoAnalysisService.stopAnalysis(sessionIdRef.current);
      sessionIdRef.current = null;
      setAnalysisState(prev => ({ ...prev, isAnalyzing: false }));
    }
  }, []);

  const pauseAnalysis = useCallback(() => {
    if (sessionIdRef.current) {
      videoAnalysisService.pauseAnalysis(sessionIdRef.current);
    }
  }, []);

  const resumeAnalysis = useCallback(() => {
    if (sessionIdRef.current) {
      videoAnalysisService.resumeAnalysis(sessionIdRef.current);
    }
  }, []);

  // Auto-analyze when video loads
  useEffect(() => {
    if (autoAnalyze && src && analysisEnabled && videoRef.current?.readyState >= 2) {
      startAnalysis();
    }
  }, [src, autoAnalyze, analysisEnabled, startAnalysis]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        videoAnalysisService.stopAnalysis(sessionIdRef.current);
      }
    };
  }, []);

  // Playback controls
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const handleVolumeChange = useCallback((newVolume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
    }
  }, []);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      videoRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Format time display
  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Generate video source URL
  const videoSrc = src || (playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : null);

  return (
    <div 
      className={cn(
        "relative bg-black rounded-lg overflow-hidden group",
        className
      )}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Video Element */}
      <video
        ref={(node) => {
          videoRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        className="w-full h-full object-contain"
        src={videoSrc || undefined}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onLoadedData={() => {
          if (autoAnalyze && analysisEnabled) {
            startAnalysis();
          }
        }}
        crossOrigin="anonymous"
      />

      {/* Hidden canvas for analysis */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Analysis Overlay */}
      {analysisEnabled && (
        <div className="absolute top-4 right-4 space-y-2">
          {/* Analysis Status */}
          <Card className="p-3 bg-black/80 backdrop-blur-sm border-white/20">
            <div className="flex items-center gap-2 text-white">
              {analysisState.isAnalyzing ? (
                <AnalysisIcon className="w-4 h-4 animate-spin" />
              ) : analysisState.error ? (
                <AlertCircleIcon className="w-4 h-4 text-red-400" />
              ) : (
                <CheckCircleIcon className="w-4 h-4 text-green-400" />
              )}
              <span className="text-sm font-medium">
                {analysisState.isAnalyzing ? 'Analyzing...' : 
                 analysisState.error ? 'Analysis Failed' : 'Analysis Ready'}
              </span>
            </div>
            
            {analysisState.isAnalyzing && (
              <div className="mt-2 space-y-1">
                <Progress value={analysisState.progress} className="h-1" />
                <div className="flex justify-between text-xs text-white/70">
                  <span>{analysisState.detectedObjects} objects</span>
                  <span>{Math.round(analysisState.progress)}%</span>
                </div>
              </div>
            )}
            
            {analysisState.error && (
              <p className="text-xs text-red-400 mt-1">{analysisState.error}</p>
            )}
          </Card>

          {/* Quality Badge */}
          {capabilities && (
            <Badge variant="outline" className="bg-black/80 backdrop-blur-sm border-white/20 text-white">
              {capabilities.recommendedQuality.toUpperCase()} Quality
            </Badge>
          )}
        </div>
      )}

      {/* Controls Overlay */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress Bar */}
          <div className="mb-4">
            <div 
              className="w-full h-1 bg-white/20 rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                handleSeek(percent * duration);
              }}
            >
              <div 
                className="h-full bg-primary rounded-full"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-white/70 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={togglePlay}
                className="text-white hover:bg-white/20"
              >
                {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
              </Button>

              {/* Analysis Controls */}
              {analysisEnabled && (
                <>
                  {!analysisState.isAnalyzing ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={startAnalysis}
                      className="text-white hover:bg-white/20"
                    >
                      <AnalysisIcon className="w-4 h-4 mr-1" />
                      Analyze
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={stopAnalysis}
                      className="text-white hover:bg-white/20"
                    >
                      <StopIcon className="w-4 h-4 mr-1" />
                      Stop
                    </Button>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Playback Rate */}
              <select
                value={playbackRate}
                onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                className="bg-black/50 text-white text-xs rounded px-2 py-1 border border-white/20"
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>

              {/* Settings */}
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20"
              >
                <SettingsIcon className="w-4 h-4" />
              </Button>

              {/* Fullscreen */}
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleFullscreen}
                className="text-white hover:bg-white/20"
              >
                <WebcamIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {!videoSrc && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading video...</p>
          </div>
        </div>
      )}
    </div>
  );
});

EnhancedVideoPlayer.displayName = 'EnhancedVideoPlayer';

export default EnhancedVideoPlayer;