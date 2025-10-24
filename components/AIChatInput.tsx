import React, { useState, useEffect, useRef } from "react";
import { LightbulbIcon as Lightbulb, MicIcon as Mic, VideoSearchIcon, VideoIcon, SendIcon as Send, RotateCwIcon, SparklesIcon } from './icons';
import { cn } from '../lib/utils';
import VideoGenerationDialog from './VideoGenerationDialog';
import { hybridSearch } from '../lib/elasticsearch';

const PLACEHOLDERS = [
  "Generate frames 100 to 200",
  "Switch to Veo 3 and generate a replacement for the first scene",
  "Name this video 'Sunset Scene'",
  "Make the lighting more cinematic and dramatic",
  "How many scenes need to be changed in order to replace the cat?",
  "Change the dialogue to 'Hello there!'"
];

interface AIChatInputProps {
  onVideoUpload: (file: File) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  isVideoLoaded: boolean;
  onSendMessage: (message: string) => void;
  onVideoGenerate?: (model: string, frameData: any) => void;
  currentVideoId?: string; // Add video ID for search context
}

const AIChatInput: React.FC<AIChatInputProps> = ({ onVideoUpload, onAnalyze, isAnalyzing, isVideoLoaded, onSendMessage, onVideoGenerate, currentVideoId }) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [videoSearchActive, setVideoSearchActive] = useState(false);
  const [generateActive, setGenerateActive] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
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
    if (file) {
      console.log('File selected:', {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified
      });
      
      if (file.type.startsWith('video/')) {
        try {
          onVideoUpload(file);
          event.target.value = '';
        } catch (error) {
          console.error('Error during video upload:', error);
        }
      } else {
        console.warn('Selected file is not a video:', file.type);
        alert('Please select a video file');
      }
    }
  };

  const handleSend = async () => {
    if (inputValue.trim()) {
      // If Video Search is active, perform Elasticsearch search
      if (videoSearchActive) {
        await handleVideoSearch(inputValue.trim());
      } else {
        onSendMessage(inputValue.trim());
      }
      setInputValue("");
    }
  };

  const handleVideoSearch = async (query: string) => {
    try {
      console.log('Performing video search for:', query);
      
      // Perform hybrid search using Elasticsearch
      const searchResults = await hybridSearch(query, currentVideoId, 5);
      
      if (searchResults.length > 0) {
        console.log(`Found ${searchResults.length} search results`);
        
        // Format search results for display
        const resultsText = searchResults.map((result, index) => {
          const scene = result.document;
          const timeInSeconds = scene.start_time_ms / 1000;
          return `**Result ${index + 1}** (${timeInSeconds.toFixed(1)}s): ${scene.scene_summary}`;
        }).join('\n\n');
        
        const searchMessage = `**Video Search Results for "${query}":**\n\n${resultsText}`;
        onSendMessage(searchMessage);
        
        // Optionally jump to the first result
        if (searchResults[0]) {
          const firstResultTime = searchResults[0].document.start_time_ms / 1000;
          console.log(`Jumping to first result at ${firstResultTime}s`);
        
        }
      } else {
        console.log('No search results found');
        onSendMessage(`No results found for "${query}". Try different keywords or make sure the video has been analyzed.`);
      }
    } catch (error) {
      console.error('Video search failed:', error);
      onSendMessage(`Video search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        "w-full max-w-2xl bg-card rounded-[32px] overflow-hidden transition-all duration-300 ease-in-out",
        isExpanded ? "h-32 shadow-xl" : "h-[68px] shadow-md"
      )}
      onClick={handleActivate}
    >
      <div className="flex flex-col items-stretch w-full h-full">
        <div className="flex items-center gap-2 p-3 rounded-full bg-card max-w-2xl w-full">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="video/*"
            style={{ display: 'none' }}
          />
          <button
            className="p-3 rounded-full hover:bg-secondary transition"
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
              "absolute left-0 top-1/2 -translate-y-1/2 text-muted-foreground select-none pointer-events-none transition-opacity duration-300",
              showPlaceholder && !isExpanded ? "opacity-100" : "opacity-0"
            )}>
              {videoSearchActive 
                ? "Search for scenes, dialogue, or objects in your video..."
                : PLACEHOLDERS[placeholderIndex]
              }
            </div>
          </div>

          <button
            className="p-3 rounded-full hover:bg-secondary transition"
            title="Voice input"
            type="button"
          >
            <Mic size={20} />
          </button>
          <button
            className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground p-3 rounded-full font-medium justify-center transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
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
                "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
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
              className={cn(`flex items-center gap-1 py-2 rounded-full transition-all duration-300 font-medium whitespace-nowrap`,
                videoSearchActive
                  ? "bg-secondary text-secondary-foreground font-semibold w-fit px-4 justify-start overflow-hidden"
                  : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground w-12 px-3 justify-center"
              )}
              title="Video Search"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setVideoSearchActive((a) => !a);
              }}
            >
              <div className="flex-shrink-0 flex items-center justify-center min-w-[20px]">
                <VideoSearchIcon size={20} />
              </div>
              <span className={cn("pb-px transition-opacity", videoSearchActive ? "opacity-100 delay-200" : "opacity-0 w-0")}>
                Video Search
              </span>
            </button>

            {onVideoGenerate && (
              <button
                className={cn(`flex items-center gap-1 py-2 rounded-full transition-all duration-300 font-medium whitespace-nowrap`,
                  generateActive
                    ? "bg-secondary text-secondary-foreground font-semibold w-fit px-4 justify-start overflow-hidden"
                    : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground w-12 px-3 justify-center"
                )}
                title="Generate Video"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (generateActive) {
                    setShowGenerateDialog(true);
                  } else {
                    setGenerateActive(true);
                  }
                }}
              >
                <div className="flex-shrink-0 flex items-center justify-center min-w-[20px]">
                  <SparklesIcon size={20} />
                </div>
                <span className={cn("pb-px transition-opacity", generateActive ? "opacity-100 delay-200" : "opacity-0 w-0")}>
                  Generate
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Video Generation Dialog */}
      {onVideoGenerate && (
        <VideoGenerationDialog
          open={showGenerateDialog}
          onOpenChange={setShowGenerateDialog}
          onGenerate={onVideoGenerate}
          selectedFrameRange={{ start: 0, end: 100, duration: 3.33 }} // TODO: Get from video settings
          videoName="Current Video" // TODO: Get actual video name
          videoId={currentVideoId}
          sceneId={currentVideoId ? `${currentVideoId}_scene_001` : undefined}
        />
      )}
    </div>
  );
};

export default AIChatInput;