import React, { useMemo } from 'react';
import { cn } from '../lib/utils';
import { AssistantIcon, UserIcon } from './icons';
import AIChatInput from './AIChatInput';
import VideoPlayerPro from './VideoPlayerPro';
import AIThinkingBlock from './AIThinkingBlock';
import { Button } from './ui/button';
import { Scene, TranscriptItem, TrackedObject } from './AnalysisPanel';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';


// --- TYPE DEFINITIONS ---
export type UserMessage = {
  id: string;
  role: 'user';
  content: string;
}

export type ReasoningMessageContent = {
    duration: number;
    steps: string[];
}

export type ReasoningMessage = {
    id: string;
    role: 'reasoning';
    content: ReasoningMessageContent;
}

export type AssistantMessageContent = {
  text: string;
}

export type AssistantMessage = {
  id: string;
  role: 'assistant';
  content: AssistantMessageContent;
}

export type Message = UserMessage | ReasoningMessage | AssistantMessage;

// --- CHILD COMPONENTS ---

const CitationPopoverContent: React.FC<{
    analysisItems: { type: string; data: Scene | TranscriptItem | TrackedObject }[];
}> = ({ analysisItems }) => {
    const [activeTab, setActiveTab] = React.useState(analysisItems[0]?.type || null);

    if (!activeTab) return null;

    const activeItem = analysisItems.find(item => item.type === activeTab);

    const renderContent = () => {
        if (!activeItem) return null;
        switch (activeItem.type) {
            case 'Scene':
                return <p className="text-gray-600">{(activeItem.data as Scene).description}</p>;
            case 'Transcript':
                return <p className="text-gray-600">{(activeItem.data as TranscriptItem).text}</p>;
            case 'Object':
                return <p className="text-gray-600">{(activeItem.data as TrackedObject).name}</p>;
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex border-b border-gray-200">
                {analysisItems.map(item => (
                    <button
                        key={item.type}
                        onClick={() => setActiveTab(item.type)}
                        className={cn(
                            'px-3 py-1 text-xs font-medium -mb-px border-b-2 focus:outline-none',
                            activeTab === item.type
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        )}
                    >
                        {item.type}
                    </button>
                ))}
            </div>
            <div className="p-1 min-h-[40px]">
                {renderContent()}
            </div>
        </div>
    );
};


const AIMessage: React.FC<{
  content: AssistantMessageContent,
  onTimestampClick: (time: number, typeHint?: string) => void,
  scenes: Scene[],
  transcripts: TranscriptItem[],
  objects: TrackedObject[]
}> = ({ content, onTimestampClick, scenes, transcripts, objects }) => {
    
    const findAllAnalysisItems = (time: number) => {
        const items: { type: string; data: Scene | TranscriptItem | TrackedObject }[] = [];
        
        const scene = scenes.find(s => s.timestamp === time);
        if (scene) items.push({ type: 'Scene', data: scene });

        const transcript = transcripts.find(t => time >= t.startTime && time <= t.endTime);
        if (transcript) items.push({ type: 'Transcript', data: transcript });

        const object = objects.find(o => o.timestamp === time);
        if (object) items.push({ type: 'Object', data: object });

        return items;
    };

    const parsedContent = useMemo(() => {
        if (!content.text) return null;

        const parts = content.text.split(/(\[\d{1,2}:\d{2}\]|\[\w+\s?\w*\]\s?at\s?\[\d{1,2}:\d{2}\])/g);
        const fullTimestampRegex = /\[(\w+\s?\w*)\]\s?at\s?\[(\d{1,2}:\d{2})\]/; // e.g., [Antique Compass] at [01:24]
        const simpleTimestampRegex = /^\[(\d{1,2}:\d{2})\]$/; // e.g., [01:23]

        const parseTimestampString = (ts: string): number => {
            const [minutes, seconds] = ts.split(':').map(Number);
            return (minutes || 0) * 60 + (seconds || 0);
        };
        
        return parts.filter(Boolean).map((part, index) => {
            let timeInSeconds: number | null = null;
            let displayPart = part;
            let typeHint: string | undefined = undefined;

            const fullMatch = part.match(fullTimestampRegex);
            const simpleMatch = part.match(simpleTimestampRegex);

            if (fullMatch) {
                timeInSeconds = parseTimestampString(fullMatch[2]);
                displayPart = `[${fullMatch[1]}]`;
                typeHint = 'object';
            } else if (simpleMatch) {
                timeInSeconds = parseTimestampString(simpleMatch[1]);
                displayPart = `[${simpleMatch[1]}]`;
            }

            if (timeInSeconds !== null) {
                const analysisItems = findAllAnalysisItems(timeInSeconds);
                const finalTime = timeInSeconds;
                
                return (
                    <Popover key={index}>
                        <PopoverTrigger asChild>
                             <Button
                                variant="outline"
                                onClick={() => onTimestampClick(finalTime, typeHint)}
                                className="inline-block h-auto align-baseline py-0.5 px-1.5 rounded-md text-sm font-mono border-blue-300 bg-blue-100 text-blue-800 hover:bg-blue-200 hover:text-blue-900"
                            >
                                {displayPart}
                            </Button>
                        </PopoverTrigger>
                        {analysisItems.length > 0 && (
                            <PopoverContent className="w-64 text-sm p-2 bg-white shadow-lg rounded-lg border z-20">
                                <CitationPopoverContent analysisItems={analysisItems} />
                            </PopoverContent>
                        )}
                    </Popover>
                );
            }
            return <React.Fragment key={index}>{part.replace(fullTimestampRegex, '')}</React.Fragment>;
        });
    }, [content.text, onTimestampClick, scenes, transcripts, objects]);


    return (
        <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full border bg-white flex items-center justify-center">
                <AssistantIcon className="h-5 w-5 text-gray-600" />
            </div>
            <div className="flex-1 space-y-2">
                <div className="rounded-2xl bg-gray-100 p-3 text-sm text-gray-800 shadow-sm max-w-3xl">
                    <p className="leading-relaxed">{parsedContent}</p>
                </div>
            </div>
        </div>
    );
};

const UserMessageBubble: React.FC<{ content: string }> = ({ content }) => {
    return (
        <div className="flex items-start justify-end gap-3">
            <div className="rounded-2xl bg-gray-900 p-3 text-sm font-medium text-white max-w-lg">
                <p>{content}</p>
            </div>
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border flex items-center justify-center">
                <UserIcon className="h-5 w-5 text-gray-600" />
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

interface VideoChatAreaProps {
    jumpToTimestamp: (time: number, typeHint?: string) => void;
    seekTime: number | null;
    onSeeked: () => void;
    scenes: Scene[];
    transcripts: TranscriptItem[];
    objects: TrackedObject[];
    onTimeUpdate: (time: number) => void;
    videoSrc: string | null;
    onVideoUpload: (file: File) => void;
    onAnalyze: () => void;
    isAnalyzing: boolean;
    messages: Message[];
    onSendMessage: (content: string) => void;
}

const VideoChatArea: React.FC<VideoChatAreaProps> = ({ jumpToTimestamp, seekTime, onSeeked, scenes, transcripts, objects, onTimeUpdate, videoSrc, onVideoUpload, onAnalyze, isAnalyzing, messages, onSendMessage }) => {
    return (
        <div className="flex-1 flex flex-col p-4 gap-4 min-w-0">
            {/* Video Players */}
            <div className="flex gap-4">
                <div className="flex-1 aspect-video">
                    <VideoPlayerPro 
                        title="Upload a video to begin" 
                        src={videoSrc}
                        seekToTime={seekTime}
                        onSeeked={onSeeked}
                        onTimeUpdate={onTimeUpdate}
                    />
                </div>
                <div className="flex-1 aspect-video">
                    <VideoPlayerPro title="Analysis Overlay" src={null} />
                </div>
            </div>

            {/* Floating Messages Area */}
            <div className="flex-grow flex flex-col min-h-0">
                <style>{`
                    .clean-scrollbar::-webkit-scrollbar {
                        width: 8px;
                    }
                    .clean-scrollbar::-webkit-scrollbar-thumb {
                        background-color: #d1d5db; /* Tailwind gray-300 */
                        border-radius: 4px;
                    }
                    .clean-scrollbar::-webkit-scrollbar-track {
                        background-color: transparent;
                    }
                    .clean-scrollbar::-webkit-scrollbar-button {
                        display: none;
                    }
                    .clean-scrollbar {
                        scrollbar-width: thin; /* For Firefox */
                        scrollbar-color: #d1d5db transparent; /* For Firefox */
                    }
                `}</style>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 clean-scrollbar">
                    {messages.map(message => {
                        switch(message.role) {
                            case 'user':
                                return <UserMessageBubble key={message.id} content={message.content} />;
                            case 'reasoning':
                                return <AIThinkingBlock key={message.id} content={message.content} />;
                            case 'assistant':
                                return <AIMessage
                                    key={message.id}
                                    content={message.content}
                                    onTimestampClick={jumpToTimestamp}
                                    scenes={scenes}
                                    transcripts={transcripts}
                                    objects={objects}
                                />;
                            default:
                                return null;
                        }
                    })}
                </div>
                <div className="p-3 flex justify-center">
                    <AIChatInput
                        onVideoUpload={onVideoUpload}
                        onAnalyze={onAnalyze}
                        isAnalyzing={isAnalyzing}
                        isVideoLoaded={!!videoSrc}
                        onSendMessage={onSendMessage}
                    />
                </div>
            </div>
        </div>
    );
};

export default VideoChatArea;