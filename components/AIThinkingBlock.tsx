import React, { useEffect, useRef, useState } from "react";
import { Card } from "./Card";
import { ThoughtIcon } from "./icons";

export interface ReasoningMessage {
  type: 'reasoning';
  content: {
    steps: string[];
  };
}

export interface GenerationProgress {
  stage: GenerationStage;
  progress: number;
  message: string;
  thinking?: string[];
}

export enum GenerationStage {
  ANALYZING = 'analyzing',
  EXTRACTING = 'extracting',
  GENERATING = 'generating',
  STITCHING = 'stitching',
  COMPLETE = 'complete',
  ERROR = 'error'
}

interface AIThinkingBlockProps {
  content?: ReasoningMessage['content'];
  generationProgress?: GenerationProgress;
}

const stageEmoji = {
  [GenerationStage.ANALYZING]: '',
  [GenerationStage.EXTRACTING]: '',
  [GenerationStage.GENERATING]: '',
  [GenerationStage.STITCHING]: '',
  [GenerationStage.COMPLETE]: '',
  [GenerationStage.ERROR]: ''
};

const stageColors = {
  [GenerationStage.ANALYZING]: 'bg-primary',
  [GenerationStage.EXTRACTING]: 'bg-secondary',
  [GenerationStage.GENERATING]: 'bg-accent',
  [GenerationStage.STITCHING]: 'bg-muted',
  [GenerationStage.COMPLETE]: 'bg-primary',
  [GenerationStage.ERROR]: 'bg-destructive'
};

export const AIThinkingBlock: React.FC<AIThinkingBlockProps> = ({ content, generationProgress }) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollIntervalRef = useRef<number | null>(null);
    const [timer, setTimer] = useState(0);

    const ThinkingContent = content ? content.steps.join('\n\n') : '';

    useEffect(() => {
      const timerInterval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timerInterval);
    }, []);

    useEffect(() => {
        if (contentRef.current && !generationProgress) {
            const el = contentRef.current;
            const maxScroll = el.scrollHeight - el.clientHeight;
            
            let scrollPosition = 0;
            let direction = 1; // 1 for down, -1 for up

            const scroll = () => {
                if (direction === 1 && scrollPosition >= maxScroll) {
                    direction = -1; // Change direction to up
                } else if (direction === -1 && scrollPosition <= 0) {
                    direction = 1; // Change direction to down
                }
                
                scrollPosition += direction * 0.5; // Adjust speed here
                el.scrollTop = scrollPosition;
            };

            scrollIntervalRef.current = window.setInterval(scroll, 50);
        }
    
        return () => {
          if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
          }
        };
    }, [ThinkingContent, generationProgress]);

    if (generationProgress) {
      return (
        <div className="flex flex-col p-3 max-w-3xl mx-auto my-4 text-sm">
          <div className="flex items-center justify-start gap-2 mb-2">
            <ThoughtIcon size={18} className="text-gray-500" />
            <p className="font-medium text-gray-600">
              Processing for {timer} seconds
            </p>
          </div>
          <Card className="relative bg-gray-50 p-4 border-gray-200/80">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${stageColors[generationProgress.stage]} animate-pulse`} />
              <span className="text-sm font-medium text-gray-700">
                {stageEmoji[generationProgress.stage]} {generationProgress.stage.charAt(0).toUpperCase() + generationProgress.stage.slice(1)}
              </span>
              <div className="flex-1 h-1 bg-gray-200 rounded">
                <div
                  className={`h-full rounded transition-all ${stageColors[generationProgress.stage]}`}
                  style={{ width: `${generationProgress.progress}%` }}
                />
              </div>
              <span className="text-sm font-mono text-gray-500">
                {generationProgress.progress}%
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <p className="font-medium text-gray-700">{generationProgress.message}</p>
              {generationProgress.thinking && generationProgress.thinking.length > 0 && (
                <div className="pl-4 border-l-2 border-gray-200 space-y-1">
                  {generationProgress.thinking.map((thought, index) => (
                    <p key={index} className="text-gray-600">
                      {thought}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      );
    }

    return (
      <div className="flex flex-col p-3 max-w-3xl mx-auto my-4 text-sm">
        <div className="flex items-center justify-start gap-2 mb-2">
            <ThoughtIcon size={18} className="text-gray-500" />
            <p className="font-medium text-gray-600">
                Thought for {timer} seconds
            </p>
        </div>
        <Card className="relative h-[150px] overflow-hidden bg-gray-50 p-0 border-gray-200/80">
          <div className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-gray-50 to-transparent z-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-gray-50 to-transparent z-10 pointer-events-none" />
          <div
            ref={contentRef}
            className="h-full overflow-hidden p-4 text-gray-500"
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {ThinkingContent}
            </p>
          </div>
        </Card>
      </div>
    );
};

export default AIThinkingBlock;