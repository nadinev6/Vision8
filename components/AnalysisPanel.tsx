import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { SearchIcon, XIcon, VideoIcon, MicIcon, TagIcon } from './icons';

interface AnalysisPanelProps {
    rightPanelWidth: number;
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

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ rightPanelWidth }) => {
    const [activeTab, setActiveTab] = useState('scene');
    const [searchQuery, setSearchQuery] = useState('');

    const renderContent = () => {
        const longText = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi. Proin porttitor, orci nec nonummy molestie, enim est eleifend mi, non fermentum diam nisl sit amet erat. Duis semper. Duis arcu massa, scelerisque vitae, consequat in, pretium a, enim. Pellentesque congue. Ut in risus volutpat libero pharetra tempor. Cras vestibulum bibendum augue. Praesent egestas leo in pede. Praesent blandit odio eu enim. Pellentesque sed dui ut augue blandit sodales. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Aliquam nibh. Mauris ac mauris sed pede pellentesque fermentum. Maecenas adipiscing ante non diam. Proin sed libero. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos hymenaeos.
        `;
        switch (activeTab) {
            case 'scene':
                return <div className="p-4 text-sm text-gray-600">Scene descriptions content goes here. It will be a scrollable list of scenes with timestamps and descriptions.{longText}</div>;
            case 'transcription':
                return <div className="p-4 text-sm text-gray-600">Transcriptions content goes here. This will show a full, searchable transcript of the video audio.{longText}</div>;
            case 'object':
                return <div className="p-4 text-sm text-gray-600">Object list content goes here. This area will display a list of detected objects and their timestamps.{longText}</div>;
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
                    <TabButton className="flex-1" active={activeTab === 'scene'} onClick={() => setActiveTab('scene')}>Scenes</TabButton>
                    <TabButton className="flex-1" active={activeTab === 'transcription'} onClick={() => setActiveTab('transcription')}>Transcript</TabButton>
                    <TabButton className="flex-1" active={activeTab === 'object'} onClick={() => setActiveTab('object')}>Objects</TabButton>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto">
                {renderContent()}
            </div>
        </aside>
    );
};

export default AnalysisPanel;