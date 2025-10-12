import React, { useState } from 'react';
import { cn, formatTime } from '../lib/utils';
import { SearchIcon, XIcon, VideoIcon, MicIcon, TagIcon } from './icons';

// --- TYPE DEFINITIONS ---
export interface Scene {
    timestamp: number;
    description: string;
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
    onTimestampClick: (time: number) => void;
    activeTimestamp: number | null;
    activeTab: string;
    onTabChange: (tab: string) => void;
}

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; className?: string }> = ({ active, onClick, children, className }) => (
    <button
        onClick={onClick}
        className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 flex justify-center',
            active ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700',
            className
        )}
    >
        {children}
    </button>
);

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ rightPanelWidth, scenes, transcripts, objects, onTimestampClick, activeTimestamp, activeTab, onTabChange }) => {
    const [searchQuery, setSearchQuery] = useState('');

    const renderContent = () => {
        switch (activeTab) {
            case 'scene':
                return (
                    <div className="p-2 space-y-1">
                        {scenes.map((scene, index) => {
                            const isActive = activeTimestamp === scene.timestamp;
                            return (
                                <button key={index} onClick={() => onTimestampClick(scene.timestamp)} className={cn("w-full text-left p-2 rounded-md hover:bg-gray-100 transition-colors", isActive && "bg-blue-50 ring-1 ring-blue-300")}>
                                    <p className="text-xs text-blue-600 font-mono">{formatTime(scene.timestamp)}</p>
                                    <p className="text-sm text-gray-700">{scene.description}</p>
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
                                 <button key={index} onClick={() => onTimestampClick(item.startTime)} className={cn("w-full text-left p-2 rounded-md hover:bg-gray-100 transition-colors", isActive && "bg-blue-50 ring-1 ring-blue-300")}>
                                    <p className="text-xs text-blue-600 font-mono">{formatTime(item.startTime)} - {formatTime(item.endTime)}</p>
                                    <p className="text-sm text-gray-700 leading-relaxed">{item.text}</p>
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
                                <button key={index} onClick={() => onTimestampClick(obj.timestamp)} className={cn("w-full text-left p-2 flex justify-between items-center rounded-md hover:bg-gray-100 transition-colors", isActive && "bg-blue-50 ring-1 ring-blue-300")}>
                                    <span className="text-sm text-gray-700 font-medium">{obj.name}</span>
                                    <span className="text-xs text-blue-600 font-mono">{formatTime(obj.timestamp)}</span>
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
        <aside className="bg-white border-l border-gray-200 flex flex-col flex-shrink-0" style={{ width: `${rightPanelWidth}px` }}>
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
                <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Filter analysis..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                            <XIcon className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
            <div className="p-2 border-b border-gray-200 flex-shrink-0">
                <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg">
                    <TabButton className="flex-1" active={activeTab === 'scene'} onClick={() => onTabChange('scene')}>Scenes</TabButton>
                    <TabButton className="flex-1" active={activeTab === 'transcription'} onClick={() => onTabChange('transcription')}>Transcript</TabButton>
                    <TabButton className="flex-1" active={activeTab === 'object'} onClick={() => onTabChange('object')}>Objects</TabButton>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto">
                {renderContent()}
            </div>
        </aside>
    );
};

export default AnalysisPanel;