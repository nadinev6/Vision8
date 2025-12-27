import React, { useRef, useState, useEffect, useCallback } from "react";
import MuxVideoPlayer from "./MuxVideoPlayer";
import { Button } from "./ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Slider } from "./ui/slider";
import {
  PlayIcon, PauseIcon, Volume2Icon, Volume1Icon, VolumeXIcon,
  Maximize2Icon, Minimize2Icon, RotateCwIcon, SettingsIcon,
  SkipBackIcon, SkipForwardIcon, HashIcon, EyeOffIcon, DownloadIcon
} from "./icons";
import { cn, formatTime } from "../lib/utils";
import VideoSettingsDialog from "./VideoSettingsDialog";

// Interface definitions remain the same
interface VideoPlayerProProps {
  src: string | null;
  title: string;
  seekToTime?: number | null;
  onSeeked?: () => void;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  syncMaster?: React.RefObject<HTMLVideoElement> | null;
  forceMute?: boolean;
  onSyncChange?: () => void;
  activeSyncMode?: 'video' | 'none';
  onSceneTrim?: (startTime: number, endTime: number) => void;
  isGeneratedVideo?: boolean;
  downloadUrl?: string | null;
}

interface FullscreenableElement extends HTMLDivElement {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

interface FullscreenableDocument extends Document {
  webkitExitFullscreen?: () => Promise<void>;
  mozCancelFullScreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
}

const FRAME_RATE = 30; // Assuming 30 FPS
const FRAME_STEP = 1 / FRAME_RATE;

const VideoPlayerPro = React.forwardRef<HTMLVideoElement, VideoPlayerProProps>(({ src, title, seekToTime, onSeeked, onTimeUpdate, onDurationChange, syncMaster, forceMute, onSyncChange, activeSyncMode, onSceneTrim, isGeneratedVideo = false, downloadUrl }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const videoCallbackRef = useCallback((node: HTMLVideoElement) => {
    if (node) {
      setVideoEl(node);
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    }
  }, [ref]);

  // State definitions
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isEnded, setIsEnded] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [showControls, setShowControls] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [totalFrames, setTotalFrames] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState<boolean>(false);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(0);
  const [showFrameCount, setShowFrameCount] = useState<boolean>(true);
  const [dragSelection, setDragSelection] = useState<{ start: number; end: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const isSlave = !!syncMaster;

  /**
   * Handle drag-to-select region on timeline
   * Allows users to select scenes by clicking and dragging on the timeline
   */
  const handleTimelineMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isSlave || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const startPercent = (x / rect.width) * 100;
    const startTime = (startPercent / 100) * duration;
    
    setIsDragging(true);
    setDragStartX(x);
    setDragSelection({ start: startTime, end: startTime });
  }, [isSlave, duration]);

  const handleTimelineMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragSelection || isSlave || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const endPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const endTime = (endPercent / 100) * duration;
    
    setDragSelection({
      start: Math.min(dragSelection.start, endTime),
      end: Math.max(dragSelection.start, endTime),
    });
  }, [isDragging, dragSelection, isSlave, duration]);

  const handleTimelineMouseUp = useCallback(() => {
    setIsDragging(false);
    // Keep selection for UI feedback
  }, []);

  // Effects (Mostly Unchanged)
  useEffect(() => {
    if (seekToTime !== null && seekToTime !== undefined && videoEl) {
      videoEl.currentTime = seekToTime;
      if (onSeeked) {
        onSeeked();
      }
    }
  }, [seekToTime, onSeeked, videoEl]);

  useEffect(() => {
    setIsPlaying(false);
    setIsEnded(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setCurrentFrame(0);
    setTotalFrames(0);
    setTrimStart(0);
    setTrimEnd(0);
  }, [src]);

  useEffect(() => {
    if (duration > 0 && trimEnd === 0) {
      setTrimEnd(duration);
    }
  }, [duration, trimEnd]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as FullscreenableDocument;
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (videoEl) {
      // Ensure volume and muted state are synchronised with the element
      videoEl.volume = volume; // Set initial volume from state
      videoEl.muted = isMuted || !!forceMute;
    }
  }, [isMuted, forceMute, videoEl, volume]);

  useEffect(() => {
    const master = syncMaster?.current;
    const slave = videoEl;
    if (!master || !slave || !isSlave) return;

    const handleMasterPlay = () => { if (slave.paused) { slave.play().catch(console.error); setIsPlaying(true); } };
    const handleMasterPause = () => { if (!slave.paused) { slave.pause(); setIsPlaying(false); } };
    const handleMasterSeek = () => {
      if (Math.abs(slave.currentTime - master.currentTime) > 0.2) {
        slave.currentTime = master.currentTime;
      }
    };

    handleMasterSeek();
    if (master.paused) { handleMasterPause(); } else { handleMasterPlay(); }

    master.addEventListener('play', handleMasterPlay);
    master.addEventListener('pause', handleMasterPause);
    master.addEventListener('timeupdate', handleMasterSeek);
    master.addEventListener('seeking', handleMasterSeek);
    master.addEventListener('seeked', handleMasterSeek);

    return () => {
      master.removeEventListener('play', handleMasterPlay);
      master.removeEventListener('pause', handleMasterPause);
      master.removeEventListener('timeupdate', handleMasterSeek);
      master.removeEventListener('seeking', handleMasterSeek);
      master.removeEventListener('seeked', handleMasterSeek);
    };
  }, [syncMaster, isSlave, videoEl]);

  // Handlers
  const togglePlay = () => {
    const videoElement = videoEl;
    if (!videoElement || !src) return;
    if (isEnded) {
      videoElement.currentTime = 0;
      setIsEnded(false);
    }
    isPlaying ? videoElement.pause() : videoElement.play();
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    const videoElement = videoEl;
    if (!videoElement) return;
    const prog = (videoElement.currentTime / videoElement.duration) * 100;
    setProgress(isFinite(prog) ? prog : 0);
    setCurrentTime(videoElement.currentTime);
    setCurrentFrame(Math.floor(videoElement.currentTime * FRAME_RATE));
    if (videoElement.duration) {
      setDuration(videoElement.duration);
      setTotalFrames(Math.floor(videoElement.duration * FRAME_RATE));
      onDurationChange?.(videoElement.duration);
    }
    if (onTimeUpdate && !isSlave) {
      onTimeUpdate(videoElement.currentTime);
    }
  };

  const handleMetadataLoaded = () => {
    if (videoEl) {
      videoEl.playbackRate = playbackSpeed;
      // Ensure video volume is set to the current state volume on load
      videoEl.volume = volume;
    }
    handleTimeUpdate();
  };

  const handleEnded = () => {
    setIsEnded(true);
    setIsPlaying(false);
  };

  const handleSeek = (percent: number) => {
    const videoElement = videoEl;
    if (!videoElement || !src) return;
    const time = (percent / 100) * (videoElement.duration || 0);
    if (isFinite(time)) videoElement.currentTime = time;
    setProgress(percent);
  };

  const handleStep = (direction: 'forward' | 'backward') => {
    const videoElement = videoEl;
    if (!videoElement || !src) return;

    if (isPlaying) {
      videoElement.pause();
      setIsPlaying(false);
    }

    const newTime = videoElement.currentTime + (direction === 'forward' ? FRAME_STEP : -FRAME_STEP);
    videoElement.currentTime = Math.max(0, Math.min(newTime, videoElement.duration));
  };

  // Toggle Mute handler
  const handleToggleMute = () => {
    if (!!forceMute) return;
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    if (videoEl) {
      videoEl.muted = newMutedState;
      // If unmuting, and volume is 0, set volume to 0.5
      if (!newMutedState && volume === 0) {
        const defaultVolume = 0.5;
        setVolume(defaultVolume);
        videoEl.volume = defaultVolume;
      }
    }
  };

  const toggleFullscreen = () => {
    const doc = document as FullscreenableDocument;
    const element = containerRef.current as FullscreenableElement;
    if (!element) return;

    const isInFullScreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);

    if (!isInFullScreen) {
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
      } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
      }
    } else {
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      } else if (doc.msExitFullscreen) {
        doc.msExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        doc.mozCancelFullScreen();
      }
    }
  };

  const VolumeIcon = (isMuted || !!forceMute) ? VolumeXIcon : volume > 0.5 ? Volume2Icon : volume > 0 ? Volume1Icon : VolumeXIcon;

  const handleSceneTrim = (startTime: number, endTime: number) => {
    setTrimStart(startTime);
    setTrimEnd(endTime);
    if (onSceneTrim) {
      onSceneTrim(startTime, endTime);
    }
  };

  // --- JSX Return ---

  return (
    <>
      <VideoSettingsDialog
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        playbackSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeed}
        videoEl={videoEl}
        onSyncChange={onSyncChange}
        activeSyncMode={activeSyncMode}
        videoDuration={duration}
        onSceneTrim={handleSceneTrim}
        trimStart={trimStart}
        trimEnd={trimEnd}
        isGeneratedVideo={isGeneratedVideo}
      />
      <div
        ref={containerRef}
        className="relative w-full h-full bg-black rounded-lg flex items-center justify-center overflow-hidden group transition-all duration-300 dark:ring-1 dark:ring-white/5"
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
      >
        {src ? (
          <MuxVideoPlayer
            ref={videoCallbackRef}
            key={src} // Remount on src change
            src={src} // Pass src (could be blob or mux URL)
            // If we have a playback ID and not a raw file, we should pass it. 
            // For now, assuming src might be a direct file URL for local dev or a mux playback URL.
            // If the app logic expects src to be a URL, MuxVideoPlayer handles it.
            className="w-full h-full"
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onLoadedMetadata={handleMetadataLoaded}
            onClick={isSlave ? undefined : togglePlay}
            title={title}
            playbackId={null}
            muted={isMuted || !!forceMute}
          // MuxPlayer manages its own state, but we are controlling it via ref
          />
        ) : (
          <p className="text-muted-foreground font-medium">{title}</p>
        )}

        {/* Frame Count Display - Controlled by showFrameCount state */}
        {src && (
          <div className={cn(
            "absolute top-4 left-4 text-white p-1 rounded-md transition-opacity duration-300 pointer-events-none text-xs font-mono",
            "bg-black/60 backdrop-blur-sm",
            (showControls && showFrameCount) ? "opacity-100" : "opacity-0"
          )}>
            F: {currentFrame} / {totalFrames}
          </div>
        )}

        {/* Control Bar */}
        <div
          className={cn(
            "absolute bottom-0 left-0 w-full transition-all duration-300 ease-in-out",
            showControls && src ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
          )}
        >
          {/* Progress Bar Container with Drag Selection */}
          <div className="relative z-10 px-4 pt-2">
            <div
              className={cn("relative w-full h-1 bg-primary-foreground/30 rounded-full group mb-2", isSlave ? "cursor-default" : "cursor-pointer")}
              onClick={(e) => {
                if (isSlave) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                handleSeek((x / rect.width) * 100);
              }}
              onMouseDown={handleTimelineMouseDown}
              onMouseMove={handleTimelineMouseMove}
              onMouseUp={handleTimelineMouseUp}
              onMouseLeave={handleTimelineMouseUp}
            >
              <div className="absolute top-0 left-0 h-full bg-white rounded-full" style={{ width: `${progress}%` }} />
              
              {/* Drag Selection Overlay */}
              {dragSelection && dragSelection.end > dragSelection.start && (
                <div
                  className="absolute top-0 h-full bg-primary/40 rounded-full transition-all"
                  style={{
                    left: `${(dragSelection.start / duration) * 100}%`,
                    width: `${((dragSelection.end - dragSelection.start) / duration) * 100}%`,
                    pointerEvents: 'none'
                  }}
                />
              )}
              
              <div className={cn("absolute top-1/2 h-3 w-3 bg-white rounded-full transition-opacity", !isSlave && "opacity-0 group-hover:opacity-100")} style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }} />
            </div>
            
            {/* Selection Info Display */}
            {dragSelection && dragSelection.end > dragSelection.start && (
              <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground bg-muted/50 rounded-sm mt-1">
                <span>Selection: {formatTime(dragSelection.start)} - {formatTime(dragSelection.end)}</span>
                <button
                  onClick={() => {
                    setTrimStart(dragSelection.start);
                    setTrimEnd(dragSelection.end);
                    handleSceneTrim(dragSelection.start, dragSelection.end);
                    setDragSelection(null);
                  }}
                  className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                >
                  Apply Selection
                </button>
                <button
                  onClick={() => setDragSelection(null)}
                  className="px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {/* Controls - Clean Light Container */}
          <div className={cn(
            "relative z-10 flex items-center justify-between text-white p-2 sm:px-4 sm:py-3 rounded-t-lg",
            "bg-black/60 backdrop-blur-sm"
          )}>
            {/* Left Controls (Play, Step, Volume, Time) */}
            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => handleStep('backward')} disabled={isSlave}>
                <SkipBackIcon className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={togglePlay} disabled={isSlave}>
                {isEnded ? <RotateCwIcon className="w-5 h-5" /> : isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => handleStep('forward')} disabled={isSlave}>
                <SkipForwardIcon className="w-5 h-5" />
              </Button>

              {/* Volume Control - Icon + Inline Slider */}
              <div className="flex items-center gap-2 group">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 flex-shrink-0"
                  disabled={!!forceMute}
                  onClick={handleToggleMute}
                >
                  <VolumeIcon className="w-5 h-5" />
                </Button>

                {/* Inline volume slider - hidden on small screens, visible on hover/always on larger screens */}
                <div className="hidden sm:block w-20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Slider
                    value={[isMuted ? 0 : volume * 100]}
                    onValueChange={(val: number[]) => {
                      const newVolume = val[0] / 100;
                      if (videoEl) videoEl.volume = newVolume;
                      setVolume(newVolume);

                      // Unmute when volume is moved up from 0
                      const muted = newVolume === 0 || !!forceMute;
                      setIsMuted(muted);
                      if (videoEl) videoEl.muted = muted;
                    }}
                  />
                </div>
              </div>

              <span className="text-sm sm:text-base font-medium whitespace-nowrap px-1">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>

            {/* Right Controls (Settings, Fullscreen) */}
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {/* Frame Count Toggle Button */}
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setShowFrameCount(prev => !prev)}
              >
                {showFrameCount ? <HashIcon className="w-5 h-5" /> : <EyeOffIcon className="w-5 h-5" />}
              </Button>

              {/* Download Button */}
              {downloadUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Create a temporary anchor to trigger download
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = title ? `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4` : 'video.mp4';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  title="Download Video"
                >
                  <DownloadIcon className="w-5 h-5" />
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setShowSettingsDialog(true)}
              >
                <SettingsIcon className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize2Icon className="w-5 h-5" /> : <Maximize2Icon className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

export default VideoPlayerPro;
