import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';
import { AssistantIcon, UserIcon } from './icons';
import AIChatInput from './AIChatInput';
import VideoPlayerPro from './VideoPlayerPro';
import AIThinkingBlock from './AIThinkingBlock';
import { Button } from './ui/button';
import { Scene, TranscriptItem, TrackedObject } from './AnalysisPanel';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import SceneReplacementActions from './SceneReplacementActions';


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
    onTimestampClick: (time: number, typeHint?: string) => void;
}> = ({ analysisItems, onTimestampClick }) => {
    const [activeTab, setActiveTab] = React.useState(analysisItems[0]?.type || null);

    if (!activeTab) return null;

    const activeItem = analysisItems.find(item => item.type === activeTab);

    const getTimestamp = (item: any) => {
        switch (item.type) {
            case 'Scene':
                return (item.data as Scene).timestamp;
            case 'Transcript':
                return (item.data as TranscriptItem).startTime;
            case 'Object':
                return (item.data as TrackedObject).timestamp;
            default:
                return 0;
        }
    };

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const renderContent = () => {
        if (!activeItem) return null;
        const timestamp = getTimestamp(activeItem);

        return (
            <div className="space-y-2">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onTimestampClick(timestamp, activeItem.type.toLowerCase());
                        // Scroll to top of the page
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-md text-sm font-mono transition-colors"
                >
                    Jump to {formatTime(timestamp)}
                </button>
                {(() => {
                    switch (activeItem.type) {
                        case 'Scene':
                            return <p className="text-muted-foreground text-sm">{(activeItem.data as Scene).description}</p>;
                        case 'Transcript':
                            return <p className="text-muted-foreground text-sm">{(activeItem.data as TranscriptItem).text}</p>;
                        case 'Object':
                            return <p className="text-muted-foreground text-sm">{(activeItem.data as TrackedObject).name}</p>;
                        default:
                            return null;
                    }
                })()}
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex border-b border-border">
                {analysisItems.map(item => (
                    <button
                        key={item.type}
                        onClick={() => setActiveTab(item.type)}
                        className={cn(
                            'px-3 py-1 text-xs font-medium -mb-px border-b-2 focus:outline-none',
                            activeTab === item.type
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
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

    // Create timestamp button component
    const TimestampButton: React.FC<{ timeInSeconds: number; displayText: string; typeHint?: string }> = ({ timeInSeconds, displayText, typeHint }) => {
        const analysisItems = findAllAnalysisItems(timeInSeconds);

        return (
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        className="inline-flex items-center align-baseline py-0.5 px-1.5 mx-1 rounded-md text-sm font-mono border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer transition-colors"
                    >
                        {displayText}
                    </button>
                </PopoverTrigger>
                {analysisItems.length > 0 && (
                    <PopoverContent className="w-96 p-4 bg-card shadow-xl rounded-lg border border-border">
                        <CitationPopoverContent
                            analysisItems={analysisItems}
                            onTimestampClick={onTimestampClick}
                        />
                    </PopoverContent>
                )}
            </Popover>
        );
    };

    // Process content and render with timestamps
    const renderContentWithTimestamps = () => {
        if (!content.text) return null;

        const parseTimestampString = (ts: string): number => {
            const [minutes, seconds] = ts.split(':').map(Number);
            return (minutes || 0) * 60 + (seconds || 0);
        };

        // Simple regex to find timestamps like [00:11], [01:24], etc.
        const timestampRegex = /\[(\d{1,2}:\d{2})\]/g;
        const parts = content.text.split(timestampRegex);

        const result = [];
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                // Regular text part
                if (parts[i].trim()) {
                    result.push(
                        <ReactMarkdown key={`text-${i}`} components={{
                            p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
                            strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
                            em: ({ children }: any) => <em className="italic text-muted-foreground">{children}</em>,
                            code: ({ children }: any) => <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground">{children}</code>,
                            pre: ({ children }: any) => <pre className="bg-muted p-3 rounded-lg overflow-x-auto my-2">{children}</pre>,
                            ul: ({ children }: any) => <ul className="list-disc list-inside my-2 space-y-1">{children}</ul>,
                            ol: ({ children }: any) => <ol className="list-decimal list-inside my-2 space-y-1">{children}</ol>,
                            li: ({ children }: any) => <li className="text-foreground">{children}</li>,
                            h1: ({ children }: any) => <h1 className="text-xl font-bold mt-4 mb-2 text-foreground">{children}</h1>,
                            h2: ({ children }: any) => <h2 className="text-lg font-semibold mt-3 mb-2 text-foreground">{children}</h2>,
                            h3: ({ children }: any) => <h3 className="text-base font-medium mt-2 mb-1 text-foreground">{children}</h3>,
                            blockquote: ({ children }: any) => <blockquote className="border-l-4 border-primary/30 pl-4 my-2 text-muted-foreground italic">{children}</blockquote>,
                            a: ({ children, href }: any) => <a href={href} className="text-primary hover:text-primary/80 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                            hr: () => <hr className="my-4 border-border" />,
                        }}>
                            {parts[i]}
                        </ReactMarkdown>
                    );
                }
            } else {
                // Timestamp part
                const timeStr = parts[i];
                const timeInSeconds = parseTimestampString(timeStr);

                // Try to determine the type based on surrounding context
                let typeHint: string | undefined = undefined;
                const prevText = parts[i - 1]?.toLowerCase() || '';
                const nextText = parts[i + 1]?.toLowerCase() || '';
                const contextText = (prevText + ' ' + nextText).toLowerCase();

                // Look for transcript/dialogue keywords
                if (contextText.includes('transcript') || contextText.includes('dialogue') ||
                    contextText.includes('says') || contextText.includes('speaks') ||
                    contextText.includes('conversation') || contextText.includes('talking') ||
                    contextText.includes('voice') || contextText.includes('audio') ||
                    contextText.includes('speech') || contextText.includes('words')) {
                    typeHint = 'transcription';
                }
                // Look for scene keywords
                else if (contextText.includes('scene') || contextText.includes('appears') ||
                    contextText.includes('shows') || contextText.includes('visual') ||
                    contextText.includes('frame') || contextText.includes('shot')) {
                    typeHint = 'scene';
                }
                // Look for object keywords
                else if (contextText.includes('object') || contextText.includes('item') ||
                    contextText.includes('detected') || contextText.includes('identified') ||
                    contextText.includes('found') || contextText.includes('visible')) {
                    typeHint = 'object';
                }



                result.push(
                    <div key={`timestamp-group-${i}`} className="inline-block">
                        <TimestampButton
                            timeInSeconds={timeInSeconds}
                            displayText={`[${timeStr}]`}
                            typeHint={typeHint}
                        />
                        {typeHint === 'scene' && (
                            <SceneReplacementActions
                                timestamp={timeStr}
                                onOptionSelected={(option) => {
                                    console.log(`Option selected for ${timeStr}: ${option}`);
                                    // TODO: Wire up to backend API using fetch
                                    /*
                                    fetch('/api/v1/mux/scenes/replace', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            asset_id: 'CURRENT_ASSET_ID', // Needs context
                                            start_time: timeInSeconds,
                                            end_time: timeInSeconds + 5, // Default duration?
                                            option: option,
                                            prompt: "Generated scene" // Needs prompt input UI
                                        })
                                    });
                                    */
                                }}
                            />
                        )}
                    </div>
                );
            }
        }

        return result;
    };

    return (
        <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <AssistantIcon className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 space-y-2 min-w-0">
                <div className="assistant-message text-foreground max-w-full overflow-hidden prose prose-sm leading-relaxed">
                    {renderContentWithTimestamps()}
                </div>
            </div>
        </div>
    );
};

const UserMessageBubble: React.FC<{ content: string }> = ({ content }) => {
    return (
        <div className="flex items-start justify-end gap-3">
            <div className="rounded-2xl bg-secondary p-3 text-sm font-medium text-secondary-foreground max-w-lg">
                <p>{content}</p>
            </div>
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-card border flex items-center justify-center">
                <UserIcon className="h-5 w-5 text-muted-foreground" />
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
    onVideoDurationChange: (duration: number) => void;
    videoSrc: string | null;
    generatedVideoSrc: string | null;
    onVideoUpload: (file: File) => void;
    onAnalyze: () => void;
    isAnalyzing: boolean;
    messages: Message[];
    onSendMessage: (content: string) => void;
    primaryVideoRef: React.RefObject<HTMLVideoElement>;
    syncMode: 'none' | 'video';
    onSyncChange: () => void;
    onVideoGenerate?: (model: string, prompt: string, settings: any) => void;
    videoSettings: {
        playbackSpeed: number;
        trimStart: number;
        trimEnd: number;
        syncMode: 'video' | 'none';
        frameMode: boolean;
        videoDuration: number;
    };
    generationSettings: {
        model: 'veo3' | 'sora2';
        frameRange: { start: number; end: number; duration: number };
        videoName: string;
    };
    onPlaybackSpeedChange: (speed: number) => void;
    onTrimRangeChange: (start: number, end: number) => void;
    onSyncModeChange: (mode: 'video' | 'none') => void;
    onFrameModeChange: (enabled: boolean) => void;
    onGenerationModelChange: (model: 'veo3' | 'sora2') => void;
    onGenerationFrameRangeChange: (start: number, end: number) => void;
    onGenerationVideoNameChange: (name: string) => void;
}

const VideoChatArea: React.FC<VideoChatAreaProps> = ({
    jumpToTimestamp,
    seekTime,
    onSeeked,
    scenes,
    transcripts,
    objects,
    onTimeUpdate,
    onVideoDurationChange,
    videoSrc,
    generatedVideoSrc,
    onVideoUpload,
    onAnalyze,
    isAnalyzing,
    messages,
    onSendMessage,
    primaryVideoRef,
    syncMode,
    onSyncChange,
    onVideoGenerate,
    videoSettings,
    generationSettings,
    onPlaybackSpeedChange,
    onTrimRangeChange,
    onSyncModeChange,
    onFrameModeChange,
    onGenerationModelChange,
    onGenerationFrameRangeChange,
    onGenerationVideoNameChange
}) => {
    return (
        <div className="flex-1 flex flex-col p-4 gap-4 min-w-0 relative">
            {/* Video Players */}
            <div className="flex gap-4">
                <div className="flex-1 aspect-video rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <VideoPlayerPro
                        ref={primaryVideoRef}
                        title="Upload a video to begin"
                        src={videoSrc}
                        seekToTime={seekTime}
                        onSeeked={onSeeked}
                        onTimeUpdate={onTimeUpdate}
                        onDurationChange={onVideoDurationChange}
                        activeSyncMode={syncMode}
                        onSyncChange={onSyncChange}
                        onSceneTrim={onTrimRangeChange}
                        isGeneratedVideo={false}
                    />
                </div>
                <div className="flex-1 aspect-video rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <VideoPlayerPro
                        title="Generated Video"
                        src={generatedVideoSrc}
                        syncMaster={syncMode === 'video' ? primaryVideoRef : null}
                        forceMute={syncMode === 'video'}
                        onSceneTrim={(startTime, endTime) => {
                            console.log('Generation range selected:', { startTime, endTime });
                            // TODO: Handle generation range selection
                        }}
                        isGeneratedVideo={true}
                    />
                </div>
            </div>

            {/* Messages Area with invisible scrollbar and fixed height */}
            <div className="flex flex-col h-[32rem]">
                <div className="flex-1 overflow-y-scroll scrollbar-none p-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <div className="max-w-2xl mx-auto space-y-4">
                        {messages.map(message => {
                            switch (message.role) {
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
                </div>
                <div className="p-3 flex justify-center">
                    <AIChatInput
                        onVideoUpload={onVideoUpload}
                        onAnalyze={onAnalyze}
                        isAnalyzing={isAnalyzing}
                        isVideoLoaded={!!videoSrc}
                        onSendMessage={onSendMessage}
                        onVideoGenerate={onVideoGenerate}
                    />
                </div>
            </div>
        </div>
    );
};

export default VideoChatArea;