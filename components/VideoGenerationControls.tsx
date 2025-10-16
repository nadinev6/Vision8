import React, { useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { VideoGenerationManager, GenerationProgress, VideoQuality } from '../lib/video-generation-manager';
import { AIThinkingBlock } from './AIThinkingBlock';

interface VideoGenerationControlsProps {
  sourceVideo: File;
  videoRef: React.RefObject<HTMLVideoElement>;
  onGenerationComplete: (generatedVideo: Blob) => void;
}

export const VideoGenerationControls: React.FC<VideoGenerationControlsProps> = ({
  sourceVideo,
  videoRef,
  onGenerationComplete
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [useAudio, setUseAudio] = useState(true);
  const [quality, setQuality] = useState<VideoQuality>('standard');
  const [timeRange, setTimeRange] = useState<[number, number]>([0, 0]);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [prompt, setPrompt] = useState('');

  // Initialize time range when video loads
  const handleVideoLoad = useCallback(() => {
    if (videoRef.current) {
      setTimeRange([0, videoRef.current.duration]);
    }
  }, [videoRef]);

  // Update time range when video seeks
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const currentTime = videoRef.current.currentTime;
      setTimeRange(prev => [currentTime, Math.max(currentTime, prev[1])]);
    }
  }, [videoRef]);

  // Handle generation
  const handleGenerate = async () => {
    if (!sourceVideo || isGenerating) return;

    setIsGenerating(true);
    const manager = new VideoGenerationManager();

    try {
      // Listen for progress updates
      manager.on('progress', (progress: GenerationProgress) => {
        setProgress(progress);
      });

      // Start generation
      const generatedVideo = await manager.generateVideo(sourceVideo, {
        startTime: timeRange[0],
        endTime: timeRange[1],
        prompt,
        useAudio,
        quality
      });

      onGenerationComplete(generatedVideo);
    } catch (error) {
      console.error('Generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Scene Description
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full h-24 px-3 py-2 text-sm rounded-md border bg-white"
            placeholder="Describe how you want to modify the scene..."
            disabled={isGenerating}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Time Range
          </label>
          <div className="px-2">
            <Slider
              min={0}
              max={videoRef.current?.duration || 100}
              step={0.1}
              value={[timeRange[0], timeRange[1]]}
              onValueChange={(values) => setTimeRange([values[0], values[1]])}
              disabled={isGenerating}
            />
          </div>
          <div className="flex justify-between text-sm text-gray-500 mt-1">
            <span>{formatTime(timeRange[0])}</span>
            <span>Duration: {formatTime(timeRange[1] - timeRange[0])}</span>
            <span>{formatTime(timeRange[1])}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Quality
            </label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as VideoQuality)}
              className="px-2 py-1 text-sm rounded border bg-white"
              disabled={isGenerating}
            >
              <option value="draft">Draft (Fast)</option>
              <option value="standard">Standard</option>
              <option value="high">High Quality (Slow)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={useAudio}
              onCheckedChange={setUseAudio}
              disabled={isGenerating}
            />
            <label className="text-sm font-medium">
              Include Audio
            </label>
          </div>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt || timeRange[0] === timeRange[1]}
          className="w-full"
        >
          {isGenerating ? 'Generating...' : 'Generate Scene'}
        </Button>
      </div>

      {progress && (
        <AIThinkingBlock generationProgress={progress} />
      )}
    </div>
  );
};

// Helper function to format time in MM:SS format
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};