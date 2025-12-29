import React, { useState } from 'react';
import { cn, formatTime } from '../lib/utils';
import { SearchIcon, XIcon, VideoIcon, MicIcon, TagIcon, RotateCwIcon } from './icons';
import { generateThumbnailUrl, hasThumbnailSupport } from '../lib/thumbnail-utils';

// --- TYPE DEFINITIONS ---
export interface Scene {
    timestamp: number;
    description: string;
    keyframeData?: string;
}
export interface TranscriptItem {
    startTime: number;
    endTime: number;
    text: string;
}
export interface TrackedObject {
    timestamp: number;
    name: string;
}

interface AnalysisPanelProps {
    rightPanelWidth: number;
    scenes: Scene[];
    transcripts: TranscriptItem[];
    objects: TrackedObject[];
    onTimestampClick: (time: number, typeHint?: string) => void;
    activeTimestamp: number | null;
    activeTab: string;
    onTabChange: (tab: string) => void;
    isAnalyzing: boolean;
    error: string | null;
    playbackId?: string | null;
}

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; className?: string }> = ({ active, onClick, children, className }) => (
    <button
        onClick={onClick}
        className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 focus:outline-none focus:ring-0 flex justify-center',
            active ? 'bg-card text-card-foreground shadow-md hover:shadow-lg' : 'text-muted-foreground hover:bg-secondary hover:text-foreground shadow-sm hover:shadow-md',
            className
        )}
    >
        {children}
    </button>
);

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ rightPanelWidth, scenes, transcripts, objects, onTimestampClick, activeTimestamp, activeTab, onTabChange, isAnalyzing, error, playbackId }) => {
    const [searchQuery, setSearchQuery] = useState('');

    const renderContent = () => {
        if (isAnalyzing) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                    <RotateCwIcon className="w-6 h-6 animate-spin mb-3" />
                    <p className="font-semibold">Analyzing video...</p>
                    <p className="text-xs mt-1">This may take a few moments.</p>
                </div>
            );
        }

        if (error) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center text-red-600 p-4">
                    <XIcon className="w-6 h-6 mb-3" />
                    <p className="font-semibold">Analysis Failed</p>
                    <p className="text-sm mt-1">{error}</p>
                </div>
            )
        }

        const hasData = scenes.length > 0 || transcripts.length > 0 || objects.length > 0;
        if (!hasData) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
                    <VideoIcon className="w-8 h-8 mb-3" />
                    <p className="font-semibold">No analysis data</p>
                    <p className="text-sm mt-1">Upload a video and click 'Analyze' to begin.</p>
                </div>
            )
        }

        switch (activeTab) {
            case 'scene':
                return (
                    <div className={cn("p-2", playbackId ? "grid grid-cols-2 gap-2" : "space-y-1")}>
                        {scenes.map((scene, index) => {
                            const isActive = activeTimestamp === scene.timestamp;
                            const thumbnailUrl = scene.keyframeData
                                ? `data:image/jpeg;base64,${scene.keyframeData}`
                                : (hasThumbnailSupport(playbackId)
                                    ? generateThumbnailUrl(playbackId, scene.timestamp, 'analysis')
                                    : null);

                            return (
                                <button
                                    key={index}
                                    onClick={() => onTimestampClick(scene.timestamp, 'scene')}
                                    className={cn(
                                        "w-full text-left rounded-md transition-all overflow-hidden group relative",
                                        playbackId ? "aspect-video bg-muted border border-border hover:ring-2 hover:ring-primary/50" : "p-2 hover:bg-secondary",
                                        isActive && (playbackId ? "ring-2 ring-primary" : "bg-primary/5 ring-1 ring-primary/30")
                                    )}
                                >
                                    {thumbnailUrl ? (
                                        <>
                                            <img src={thumbnailUrl} alt={`Scene at ${formatTime(scene.timestamp)}`} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                                <span className="text-xs text-white bg-black/60 px-1 rounded">{formatTime(scene.timestamp)}</span>
                                            </div>
                                            {isActive && <div className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full shadow-lg" />}
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-xs text-primary font-mono">{formatTime(scene.timestamp)}</p>
                                            <p className="text-sm text-foreground">{scene.description}</p>
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                );

            case 'transcription':
                return (
                    <div className="p-2 space-y-2">
                        {transcripts.map((item, index) => {
                            const isActive = activeTimestamp !== null && activeTimestamp >= item.startTime && activeTimestamp <= item.endTime;
                            return (
                                <button key={index} onClick={() => onTimestampClick(item.startTime, 'transcription')} className={cn("w-full text-left p-2 rounded-md hover:bg-secondary transition-colors", isActive && "bg-primary/5 ring-1 ring-primary/30")}>
                                    <p className="text-xs text-primary font-mono">{formatTime(item.startTime)} - {formatTime(item.endTime)}</p>
                                    <p className="text-sm text-foreground leading-relaxed">{item.text}</p>
                                </button>
                            );
                        })}
                    </div>
                );
            case 'object':
                return (
                    <div className="p-2 space-y-1">
                        {objects.map((obj, index) => {
                            const isActive = activeTimestamp === obj.timestamp;
                            return (
                                <button key={index} onClick={() => onTimestampClick(obj.timestamp, 'object')} className={cn("w-full text-left p-2 flex justify-between items-center rounded-md hover:bg-secondary transition-colors", isActive && "bg-primary/5 ring-1 ring-primary/30")}>
                                    <span className="text-sm text-foreground font-medium">{obj.name}</span>
                                    <span className="text-xs text-primary font-mono">{formatTime(obj.timestamp)}</span>
                                </button>
                            );
                        })}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <aside className="bg-card border-l border-border flex flex-col flex-shrink-0" style={{ width: `${rightPanelWidth}px` }}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0 bg-muted/30">
                <h2 className="font-semibold text-sm flex items-center">
                    <VideoIcon className="w-4 h-4 mr-2 text-primary" />
                    Video Analysis
                </h2>
                <div className="flex items-center space-x-1">
                </div>
            </div>
            <div className="p-3 border-b border-border flex-shrink-0">
                <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Filter analysis..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-ring bg-card text-foreground"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <XIcon className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
            <div className="p-2 border-b border-border flex-shrink-0">
                <div className="flex items-center space-x-1 bg-secondary p-1 rounded-lg">
                    <TabButton className="flex-1" active={activeTab === 'scene'} onClick={() => onTabChange('scene')}>Scenes</TabButton>
                    <TabButton className="flex-1" active={activeTab === 'transcription'} onClick={() => onTabChange('transcription')}>Transcript</TabButton>
                    <TabButton className="flex-1" active={activeTab === 'object'} onClick={() => onTabChange('object')}>Objects</TabButton>
                </div>
            </div>
            <div className="flex-grow relative min-h-0">
                <div className="absolute inset-0">
                    <div className="h-full overflow-y-auto p-2 custom-scrollbar">
                        {renderContent()}
                    </div>
                </div>
            </div>
        </aside >
    );
};

export default AnalysisPanel;
