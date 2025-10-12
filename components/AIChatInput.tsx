import React, { useState, useEffect, useRef } from "react";
import { LightbulbIcon as Lightbulb, MicIcon as Mic, VideoSearchIcon, VideoIcon, SendIcon as Send, RotateCwIcon } from './icons';
import { cn } from '../lib/utils';

const PLACEHOLDERS = [
  "Search for the specific scene where the Joker gets knocked over",
  "Find a the scene where Jack says 'I love you'",
  "How many times does a cat appear in this film?",
  "Where else does the lady in the red dress appear?",
  "How many scenes need to be changed in order to replace the cat?",
  "Summarize this film focusing on the main characters",
];

interface AIChatInputProps {
  onVideoUpload: (file: File) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  isVideoLoaded: boolean;
  onSendMessage: (message: string) => void;
}

const AIChatInput: React.FC<AIChatInputProps> = ({ onVideoUpload, onAnalyze, isAnalyzing, isVideoLoaded, onSendMessage }) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [videoSearchActive, setVideoSearchActive] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      onVideoUpload(file);
      event.target.value = '';
    }
  };

  const handleSend = () => {
    if (inputValue.trim()) {
      onSendMessage(inputValue.trim());
      setInputValue("");
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSend();
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

            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
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
              onClick={handleSend}
            >
              <Send size={18} />
            </button>
          </div>

          <div
            className={cn(
                "w-full flex justify-start px-4 items-center text-sm transition-all duration-350 ease-out",
                isExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5 pointer-events-none"
            )}
            style={{ marginTop: 8 }}
          >
            <div className="flex gap-3 items-center">
              <button
                className={cn(`flex items-center gap-2 px-4 py-2 rounded-full transition-all font-medium group disabled:opacity-60 disabled:cursor-not-allowed`,
                  "bg-gray-100 text-gray-700 hover:bg-gray-200"
                )}
                title="Analyze Video"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAnalyze();
                }}
                disabled={isAnalyzing || !isVideoLoaded}
              >
                {isAnalyzing ? (
                  <>
                    <RotateCwIcon className="animate-spin" size={18} />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Lightbulb
                      className="group-hover:fill-yellow-300 transition-all"
                      size={18}
                    />
                    Analyze
                  </>
                )}
              </button>

              <button
                className={cn(`flex items-center gap-1 py-2 rounded-full transition-all duration-300 font-medium whitespace-nowrap overflow-hidden`,
                  videoSearchActive
                    ? "bg-gray-200 text-gray-800 font-semibold w-fit px-4 justify-start"
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