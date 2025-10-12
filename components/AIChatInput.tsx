import React, { useState, useEffect, useRef } from "react";
import { LightbulbIcon as Lightbulb, MicIcon as Mic, VideoSearchIcon, VideoIcon, SendIcon as Send } from './icons';
import { cn } from '../lib/utils';

const PLACEHOLDERS = [
  "Search for the scene where Jack says 'I love you'",
  "Find any instances of a blue Toyota",
  "How many times does a cat appear in this film?",
  "Where else does the lady in the red dress appear?",
  "How many scenes need to be changed in order to replace the cat?",
  "Summarize this film",
];

interface AIChatInputProps {
  onVideoUpload: (url: string) => void;
}

const AIChatInput: React.FC<AIChatInputProps> = ({ onVideoUpload }) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [analyzeActive, setAnalyzeActive] = useState(false);
  const [videoSearchActive, setVideoSearchActive] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cycle placeholder text when input is inactive
  useEffect(() => {
    if (isActive || inputValue) return;

    const interval = setInterval(() => {
      setShowPlaceholder(false);
      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
        setShowPlaceholder(true);
      }, 400);
    }, 3000);

    return () => clearInterval(interval);
  }, [isActive, inputValue]);

  // Close input when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        if (!inputValue) setIsActive(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inputValue]);

  const handleActivate = () => setIsActive(true);
  
  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      const videoUrl = URL.createObjectURL(file);
      onVideoUpload(videoUrl);
      // Reset file input to allow uploading the same file again
      event.target.value = '';
    }
  };
  
  const isExpanded = isActive || !!inputValue;

  return (
      <div
        ref={wrapperRef}
        className={cn(
            "w-full max-w-3xl bg-white rounded-[32px] overflow-hidden transition-all duration-300 ease-in-out",
            isExpanded ? "h-32 shadow-xl" : "h-[68px] shadow-md"
        )}
        onClick={handleActivate}
      >
        <div className="flex flex-col items-stretch w-full h-full">
          {/* Input Row */}
          <div className="flex items-center gap-2 p-3 rounded-full bg-white max-w-3xl w-full">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*"
              style={{ display: 'none' }}
            />
            <button
              className="p-3 rounded-full hover:bg-gray-100 transition"
              title="Upload a video"
              type="button"
              onClick={handleAttachClick}
            >
              <VideoIcon size={20} />
            </button>

            {/* Text Input & Placeholder */}
            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="flex-1 border-0 outline-0 rounded-md py-2 text-base bg-transparent w-full font-normal relative z-10 focus:ring-0"
                onFocus={handleActivate}
              />
              <div className={cn(
                  "absolute left-0 top-1/2 -translate-y-1/2 text-gray-400 select-none pointer-events-none transition-opacity duration-300",
                  showPlaceholder && !isExpanded ? "opacity-100" : "opacity-0"
              )}>
                  {PLACEHOLDERS[placeholderIndex]}
              </div>
            </div>

            <button
              className="p-3 rounded-full hover:bg-gray-100 transition"
              title="Voice input"
              type="button"
            >
              <Mic size={20} />
            </button>
            <button
              className="flex items-center gap-1 bg-black hover:bg-zinc-700 text-white p-3 rounded-full font-medium justify-center"
              title="Send"
              type="button"
            >
              <Send size={18} />
            </button>
          </div>

          {/* Expanded Controls */}
          <div
            className={cn(
                "w-full flex justify-start px-4 items-center text-sm transition-all duration-350 ease-out",
                isExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5 pointer-events-none"
            )}
            style={{ marginTop: 8 }}
          >
            <div className="flex gap-3 items-center">
              {/* Analyze Toggle */}
              <button
                className={cn(`flex items-center gap-1 px-4 py-2 rounded-full transition-all font-medium group`,
                  analyzeActive
                    ? "bg-gray-200 text-gray-800 font-semibold"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
                title="Analyze"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setAnalyzeActive((a) => !a);
                }}
              >
                <Lightbulb
                  className="group-hover:fill-yellow-300 transition-all"
                  size={18}
                />
                Analyze
              </button>

              {/* Video Search Toggle */}
              <button
                className={cn(`flex items-center gap-1 py-2 rounded-full transition-all duration-300 font-medium whitespace-nowrap overflow-hidden`,
                  videoSearchActive
                    ? "bg-gray-200 text-gray-800 font-semibold w-32 px-4 justify-start"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 w-9 px-2 justify-center"
                )}
                title="Video Search"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setVideoSearchActive((a) => !a);
                }}
              >
                <div className="flex-shrink-0">
                  <VideoSearchIcon size={20} />
                </div>
                <span className={cn("pb-px transition-opacity", videoSearchActive ? "opacity-100 delay-200" : "opacity-0")}>
                Video Search
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
  );
};

export default AIChatInput;