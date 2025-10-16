import React, { useRef, useState, useEffect, useImperativeHandle, useCallback } from "react";
import { Button } from "./ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Slider } from "./ui/slider";
import { PlayIcon, PauseIcon, Volume2Icon, Volume1Icon, VolumeXIcon, Maximize2Icon, Minimize2Icon, RotateCwIcon, SettingsIcon, SkipBackIcon, SkipForwardIcon, ScissorsIcon } from "./icons";
import { cn, formatTime } from "../lib/utils";
import { SceneExtractor } from "./SceneExtractor";

interface VideoPlayerProProps {
  src: string | null;
  title: string;
  seekToTime?: number | null;
  onSeeked?: () => void;
  onTimeUpdate?: (time: number) => void;
  syncMaster?: React.RefObject<HTMLVideoElement> | null;
  forceMute?: boolean;
  onSyncChange?: () => void;
  activeSyncMode?: 'video' | 'none';
  onSceneExtracted?: (clipUrl: string, startTime: number, endTime: number) => void;
}

// Interfaces for cross-browser fullscreen support
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

const VideoPlayerPro = React.forwardRef<HTMLVideoElement, VideoPlayerProProps>(({ src, title, seekToTime, onSeeked, onTimeUpdate, syncMaster, forceMute, onSyncChange, activeSyncMode }, ref) => {
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
  const isSlave = !!syncMaster;

  useEffect(() => {
    if (seekToTime !== null && seekToTime !== undefined && videoEl) {
        videoEl.currentTime = seekToTime;
        if (onSeeked) {
            onSeeked();
        }
    }
  }, [seekToTime, onSeeked, videoEl]);

  useEffect(() => {
    // Reset state when src changes
    setIsPlaying(false);
    setIsEnded(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setCurrentFrame(0);
    setTotalFrames(0);
  }, [src]);

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
        videoEl.muted = isMuted || !!forceMute;
    }
  }, [isMuted, forceMute, videoEl]);

  useEffect(() => {
    const master = syncMaster?.current;
    const slave = videoEl;
    if (!master || !slave || !isSlave) return;

    const handleMasterPlay = () => { if(slave.paused) { slave.play().catch(console.error); setIsPlaying(true); }};
    const handleMasterPause = () => { if(!slave.paused) { slave.pause(); setIsPlaying(false); }};
    const handleMasterSeek = () => {
        if (Math.abs(slave.currentTime - master.currentTime) > 0.2) { // Add tolerance
             slave.currentTime = master.currentTime;
        }
    };
    
    // Initial sync
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
    }
    if (onTimeUpdate && !isSlave) {
        onTimeUpdate(videoElement.currentTime);
    }
  };

  const handleMetadataLoaded = () => {
    if (videoEl) {
        videoEl.playbackRate = playbackSpeed;
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

  const toggleFullscreen = () => {
    const doc = document as FullscreenableDocument;
    const element = containerRef.current as FullscreenableElement;
    if (!element) return;

    const isInFullScreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);

    if (!isInFullScreen) {
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) { /* Safari */
        element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) { /* IE11 */
        element.msRequestFullscreen();
      } else if (element.mozRequestFullScreen) { /* Firefox */
        element.mozRequestFullScreen();
      }
    } else {
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) { /* Safari */
        doc.webkitExitFullscreen();
      } else if (doc.msExitFullscreen) { /* IE11 */
        doc.msExitFullscreen();
      } else if (doc.mozCancelFullScreen) { /* Firefox */
        doc.mozCancelFullScreen();
      }
    }
  };
  
  const VolumeIcon = (isMuted || !!forceMute) ? VolumeXIcon : volume > 0.5 ? Volume2Icon : Volume1Icon;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {src ? (
         <video
            ref={videoCallbackRef}
            key={src}
            className="w-full h-full object-contain"
            src={src}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onLoadedMetadata={handleMetadataLoaded}
            onClick={isSlave ? undefined : togglePlay}
         />
      ) : (
        <p className="text-gray-400 font-medium">{title}</p>
      )}

      <div
        className={cn(
            "absolute bottom-0 left-0 w-full transition-all duration-300 ease-in-out",
            showControls && src ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        <div className="relative z-10 px-4 pb-3">
          <div
            className={cn("relative w-full h-1.5 bg-white/20 rounded-full group mb-2", isSlave ? "cursor-default" : "cursor-pointer")}
            onClick={(e) => {
              if (isSlave) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              handleSeek((x / rect.width) * 100);
            }}
          >
            <div className="absolute top-0 left-0 h-full bg-white rounded-full" style={{ width: `${progress}%` }}/>
            <div className={cn("absolute top-1/2 h-3 w-3 bg-white rounded-full transition-opacity", !isSlave && "opacity-0 group-hover:opacity-100")} style={{ left: `${progress}%`, transform: `translate(-50%, -50%)` }}/>
          </div>

          <div className="flex items-center justify-between text-white gap-4">
            <div className="flex flex-1 items-center gap-2 min-w-0">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => handleStep('backward')} disabled={isSlave}>
                <SkipBackIcon className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={togglePlay} disabled={isSlave}>
                {isEnded ? <RotateCwIcon className="w-5 h-5" /> : isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => handleStep('forward')} disabled={isSlave}>
                <SkipForwardIcon className="w-5 h-5" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" disabled={!!forceMute}>
                      <VolumeIcon className="w-5 h-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-32 bg-black/50 backdrop-blur-md border-white/20 p-2">
                  <Slider
                    value={[isMuted ? 0 : volume * 100]}
                    onValueChange={(val: number[]) => {
                      const newVolume = val[0] / 100;
                      if (videoEl) videoEl.volume = newVolume;
                      setVolume(newVolume);
                      const muted = newVolume === 0;
                      setIsMuted(muted);
                      if (videoEl) videoEl.muted = muted;
                    }}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs font-mono whitespace-nowrap overflow-hidden text-ellipsis">
                {formatTime(currentTime)} (Frame: {currentFrame}) / {formatTime(duration)} (Total: {totalFrames})
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
               <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                    <SettingsIcon className="w-5 h-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="bg-white/90 backdrop-blur-md border-gray-200 text-black w-[320px] p-2 right-0">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-gray-500 px-2">Speed</span>
                      <div className="grid grid-cols-4 gap-1">
                        {[0.5, 1, 1.5, 2].map((s) => (
                          <Button key={s} variant={playbackSpeed === s ? "ghost" : "ghost"} size="sm" className={cn("justify-start text-xs text-black", playbackSpeed === s && "bg-gray-200 font-semibold")}
                            onClick={() => {
                              if (videoEl) videoEl.playbackRate = s;
                              setPlaybackSpeed(s);
                            }}
                          >
                            {s === 1 ? 'Normal' : `${s}x`}
                          </Button>
                        ))}
                      </div>
                    </div>
                    
                    {src && videoEl && (
                      <>
                        <div className="h-px bg-gray-200"></div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-gray-500 px-2">Scene Extraction</span>
                          <SceneExtractor
                            videoUrl={src}
                            videoDuration={duration}
                            onSceneExtracted={onSceneExtracted}
                          />
                        </div>
                      </>
                    )}

                    {onSyncChange && (
                      <>
                        <div className="h-px bg-gray-200"></div>
                        <Button onClick={onSyncChange} variant="ghost" size="sm" className={cn("w-full justify-start text-xs text-black hover:bg-gray-200", activeSyncMode === 'video' && "bg-black text-white hover:bg-zinc-800 font-semibold")}>
                          Sync Video
                        </Button>
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize2Icon className="w-5 h-5" /> : <Maximize2Icon className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default VideoPlayerPro;