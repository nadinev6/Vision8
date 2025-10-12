import React, { useEffect, useRef, useState } from "react";
import { Card } from "./Card";
import { ThoughtIcon } from "./icons";
import { ReasoningMessage } from "./VideoChatArea";

interface AIThinkingBlockProps {
    content: ReasoningMessage['content'];
}

const AIThinkingBlock: React.FC<AIThinkingBlockProps> = ({ content }) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollIntervalRef = useRef<number | null>(null);
    const [timer, setTimer] = useState(0);

    const ThinkingContent = content.steps.join('\n\n');

    useEffect(() => {
      const timerInterval = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timerInterval);
    }, []);

    useEffect(() => {
        if (contentRef.current) {
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
    }, [ThinkingContent]);

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