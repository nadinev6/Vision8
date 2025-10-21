import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { formatTime } from '../lib/utils';
import { RotateCwIcon } from './icons';

interface VideoSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  videoEl: HTMLVideoElement | null;
  onSyncChange?: () => void;
  activeSyncMode?: 'video' | 'none';
  videoDuration: number;
  onSceneTrim?: (startTime: number, endTime: number) => void;
  trimStart?: number;
  trimEnd?: number;
  isGeneratedVideo?: boolean;
}

// Constants for the slider
const DEFAULT_SPEED = 1.0;
const SPEED_MIN = 0.1;
const SPEED_MAX = 3.0;
const SPEED_STEP = 0.05;

const VideoSettingsDialog: React.FC<VideoSettingsDialogProps> = ({
  open,
  onOpenChange,
  playbackSpeed,
  setPlaybackSpeed,
  videoEl,
  onSyncChange,
  activeSyncMode,
  videoDuration,
  onSceneTrim,
  trimStart = 0,
  trimEnd,
  isGeneratedVideo = false
}) => {
  const FRAME_RATE = 30; // Assuming 30 FPS
  const totalFrames = Math.floor(videoDuration * FRAME_RATE);

  const [localTrimStart, setLocalTrimStart] = useState(trimStart);
  const [localTrimEnd, setLocalTrimEnd] = useState(trimEnd || videoDuration);
  const [localPlaybackSpeed, setLocalPlaybackSpeed] = useState(playbackSpeed);
  const [useFrameMode, setUseFrameMode] = useState(false);

  // Sync local state for trim/speed on prop change
  useEffect(() => {
    setLocalTrimStart(trimStart);
  }, [trimStart]);

  useEffect(() => {
    setLocalTrimEnd(trimEnd || videoDuration);
  }, [trimEnd, videoDuration]);

  // Also sync the local speed state
  useEffect(() => {
    setLocalPlaybackSpeed(playbackSpeed);
  }, [playbackSpeed]);


  const handleApplyTrim = () => {
    if (onSceneTrim) {
      onSceneTrim(localTrimStart, localTrimEnd);
    }
    // Apply speed changes globally when applying trim/closing dialog
    if (videoEl) videoEl.playbackRate = localPlaybackSpeed;
    setPlaybackSpeed(localPlaybackSpeed);
    onOpenChange(false);
  };

  const handleResetTrim = () => {
    setLocalTrimStart(0);
    setLocalTrimEnd(videoDuration);
    if (onSceneTrim) {
      onSceneTrim(0, videoDuration);
    }
  };

  const handleSpeedChange = (value: number[]) => {
    const newSpeed = value[0];
    setLocalPlaybackSpeed(newSpeed);
    if (videoEl) videoEl.playbackRate = newSpeed;
  };

  const handleSpeedReset = () => {
    setLocalPlaybackSpeed(DEFAULT_SPEED);
    if (videoEl) videoEl.playbackRate = DEFAULT_SPEED;
  };

  // Convert time to frame number
  const timeToFrame = (time: number): number => {
    return Math.floor(time * FRAME_RATE);
  };

  // Convert frame number to time
  const frameToTime = (frame: number): number => {
    return frame / FRAME_RATE;
  };

  // Get current values in frame mode
  const startFrame = timeToFrame(localTrimStart);
  const endFrame = timeToFrame(localTrimEnd);

  // Handle frame-based changes
  const handleStartFrameChange = (val: number[]) => {
    const newFrame = Math.min(val[0], endFrame - 1);
    const newTime = frameToTime(newFrame);
    setLocalTrimStart(newTime);
    if (videoEl) videoEl.currentTime = newTime;
  };

  const handleEndFrameChange = (val: number[]) => {
    const newFrame = Math.max(val[0], startFrame + 1);
    const newTime = frameToTime(newFrame);
    setLocalTrimEnd(newTime);
    if (videoEl) videoEl.currentTime = newTime;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={isGeneratedVideo ? "Generated Video Settings" : "Video Settings"}
        onClose={() => onOpenChange(false)}
        className="w-[550px]"
      >
        <div className="space-y-5">
          {/* Playback Speed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Playback Speed</label>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono font-medium min-w-[100px] text-right ${localPlaybackSpeed === DEFAULT_SPEED ? 'text-primary' : 'text-foreground'}`}>
                  {localPlaybackSpeed.toFixed(2)}{localPlaybackSpeed === DEFAULT_SPEED ? ' (Normal)' : 'x'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSpeedReset}
                  disabled={localPlaybackSpeed === DEFAULT_SPEED}
                  className="h-6 w-6 text-muted-foreground hover:text-primary"
                >
                  <RotateCwIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Slider
              min={SPEED_MIN}
              max={SPEED_MAX}
              step={SPEED_STEP}
              value={[localPlaybackSpeed]}
              onValueChange={handleSpeedChange}
              className="px-2"
            />
          </div>

          {/* Video Sync */}
          {onSyncChange && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">Video Sync</label>
              <div className="flex items-center justify-between p-4 bg-card/40 backdrop-blur-sm rounded-lg border border-border/40">
                <div>
                  <p className="text-sm font-medium text-foreground">Synchronise videos</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Play both videos in sync
                  </p>
                </div>
                <button
                  onClick={onSyncChange}
                  className={`relative w-12 h-6 rounded-full transition-colors ${activeSyncMode === 'video' ? 'bg-primary' : 'bg-muted'}`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-card rounded-full shadow-md transition-transform ${activeSyncMode === 'video' ? 'translate-x-6' : 'translate-x-0.5'}`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Scene Trim */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                {isGeneratedVideo ? 'Generation Range' : 'Scene Trim'}
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setUseFrameMode(!useFrameMode)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  {useFrameMode ? 'Switch to Time' : 'Switch to Frames'}
                </button>
                <span className="text-border">|</span>
                <button
                  onClick={handleResetTrim}
                  className="text-xs text-primary hover:underline"
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="space-y-4 p-4 bg-card/40 backdrop-blur-sm rounded-lg border border-border/40">
              {/* Start Time/Frame */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">
                    {useFrameMode ? 'Start Frame' : 'Start Time'}
                  </span>
                  <span className="text-sm font-mono text-foreground font-medium">
                    {useFrameMode ? `F ${startFrame}` : formatTime(localTrimStart)}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={useFrameMode ? totalFrames : videoDuration}
                  step={useFrameMode ? 1 : 0.1}
                  value={useFrameMode ? [startFrame] : [localTrimStart]}
                  onValueChange={useFrameMode ? handleStartFrameChange : (val) => {
                    const newStart = Math.min(val[0], localTrimEnd - 0.1);
                    setLocalTrimStart(newStart);
                    if (videoEl) videoEl.currentTime = newStart;
                  }}
                />
              </div>

              {/* End Time/Frame */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">
                    {useFrameMode ? 'End Frame' : 'End Time'}
                  </span>
                  <span className="text-sm font-mono text-foreground font-medium">
                    {useFrameMode ? `F ${endFrame}` : formatTime(localTrimEnd)}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={useFrameMode ? totalFrames : videoDuration}
                  step={useFrameMode ? 1 : 0.1}
                  value={useFrameMode ? [endFrame] : [localTrimEnd]}
                  onValueChange={useFrameMode ? handleEndFrameChange : (val) => {
                    const newEnd = Math.max(val[0], localTrimStart + 0.1);
                    setLocalTrimEnd(newEnd);
                    if (videoEl) videoEl.currentTime = newEnd;
                  }}
                />
              </div>
              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Duration</span>
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-foreground font-medium">
                      {formatTime(localTrimEnd - localTrimStart)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {endFrame - startFrame} frames @ {FRAME_RATE}fps
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {isGeneratedVideo && (
              <p className="text-xs text-muted-foreground">
                Select the time range for video generation. Only this portion will be processed.
              </p>
            )}
          </div>

          {/* Apply Button */}
          <div className="flex gap-3">
            <button
              onClick={handleApplyTrim}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors shadow-sm hover:shadow-md"
            >
              Apply
            </button>
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md font-medium hover:bg-secondary/80 transition-colors border border-border shadow-sm hover:shadow-md"
            >
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VideoSettingsDialog;