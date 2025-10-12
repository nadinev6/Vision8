import React, { useRef, useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Slider } from "./ui/slider";
import { PlayIcon, PauseIcon, Volume2Icon, Volume1Icon, VolumeXIcon, Maximize2Icon, RotateCwIcon, SettingsIcon } from "./icons";
import { cn } from "../lib/utils";

interface VideoPlayerProProps {
  src: string | null;
  title: string;
}

const formatTime = (seconds: number) => {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const VideoPlayerPro: React.FC<VideoPlayerProProps> = ({ src, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isEnded, setIsEnded] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [showControls, setShowControls] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  useEffect(() => {
    // Reset state when src changes
    setIsPlaying(false);
    setIsEnded(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  const togglePlay = () => {
    if (!videoRef.current || !src) return;
    if (isEnded) {
      videoRef.current.currentTime = 0;
      setIsEnded(false);
    }
    isPlaying ? videoRef.current.pause() : videoRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const prog = (videoRef.current.currentTime / videoRef.current.duration) * 100;
    setProgress(isFinite(prog) ? prog : 0);
    setCurrentTime(videoRef.current.currentTime);
    if (videoRef.current.duration) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsEnded(true);
    setIsPlaying(false);
  };

  const handleSeek = (percent: number) => {
    if (!videoRef.current || !src) return;
    const time = (percent / 100) * (videoRef.current.duration || 0);
    if (isFinite(time)) videoRef.current.currentTime = time;
    setProgress(percent);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen().catch(err => console.error(err));
    }
  };
  
  const VolumeIcon = isMuted ? VolumeXIcon : volume > 0.5 ? Volume2Icon : Volume1Icon;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {src ? (
         <video
            ref={videoRef}
            key={src}
            className="w-full h-full object-contain"
            src={src}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onLoadedMetadata={handleTimeUpdate}
            onClick={togglePlay}
         />
      ) : (
        <p className="text-gray-400 font-medium">{title}</p>
      )}

      <div
        className={cn(
            "absolute bottom-4 left-1/2 transform -translate-x-1/2 w-[95%] backdrop-blur-md bg-black/30 rounded-lg p-2 flex flex-col gap-2 transition-all duration-300 ease-in-out",
            showControls && src ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div
          className="relative w-full h-1.5 bg-white/20 rounded-full cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            handleSeek((x / rect.width) * 100);
          }}
        >
          <div className="absolute top-0 left-0 h-full bg-white rounded-full" style={{ width: `${progress}%` }}/>
          <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: `${progress}%`, transform: `translate(-${progress}%, -50%)` }}/>
        </div>

        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={togglePlay}>
              {isEnded ? <RotateCwIcon className="w-5 h-5" /> : isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                    <VolumeIcon className="w-5 h-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-32 bg-black/50 backdrop-blur-md border-white/20 p-2">
                <Slider
                  value={[isMuted ? 0 : volume * 100]}
                  onValueChange={(val: number[]) => {
                    const newVolume = val[0] / 100;
                    if (videoRef.current) videoRef.current.volume = newVolume;
                    setVolume(newVolume);
                    setIsMuted(newVolume === 0);
                    if (videoRef.current) videoRef.current.muted = newVolume === 0;
                  }}
                />
              </PopoverContent>
            </Popover>
            <span className="text-xs font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
             <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                  <SettingsIcon className="w-5 h-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="bg-white/90 backdrop-blur-md border-gray-200 text-black w-40 p-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-500 px-2">Speed</span>
                  {[0.5, 1, 1.5, 2].map((s) => (
                    <Button key={s} variant={playbackSpeed === s ? "ghost" : "ghost"} size="sm" className={cn("w-full justify-start text-xs text-black", playbackSpeed === s && "bg-gray-200 font-semibold")}
                      onClick={() => {
                        if (videoRef.current) videoRef.current.playbackRate = s;
                        setPlaybackSpeed(s);
                      }}
                    >
                      {s === 1 ? 'Normal' : `${s}x`}
                    </Button>
                  ))}
                  <div className="h-px bg-gray-200 my-1"></div>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-black hover:bg-gray-200">Sync Audio</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-black hover:bg-gray-200">Sync Video</Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={toggleFullscreen}>
              <Maximize2Icon className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerPro;