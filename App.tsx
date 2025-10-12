import React, { useState, useCallback } from 'react';
import HistorySidebar from './components/HistorySidebar';
import AnalysisPanel, { Scene, TranscriptItem, TrackedObject } from './components/AnalysisPanel';
import VideoChatArea from './components/VideoChatArea';
import { LogoIcon, UserIcon } from './components/icons';

// --- MOCK DATA ---
const MOCK_SCENES: Scene[] = [
  { timestamp: 4, description: "Opening shot of the city skyline at dusk." },
  { timestamp: 15, description: "Main character, Alex, introduced in a busy cafe, looking anxious." },
  { timestamp: 45, description: "A mysterious package is left on Alex's table." },
  { timestamp: 83, description: "Alex opens the package to find an old compass." },
  { timestamp: 121, description: "Flashback sequence to a childhood memory on a sailboat." },
  { timestamp: 245, description: "Alex solves the first clue, leading to a library." },
  { timestamp: 291, description: "A final shot shows Alex looking hopeful." },
];

const MOCK_TRANSCRIPTS: TranscriptItem[] = [
  { startTime: 15, endTime: 18, text: "I'll just have a black coffee, no sugar." },
  { startTime: 22, endTime: 25, text: "Haven't seen you around here before." },
  { startTime: 48, endTime: 51, text: "Excuse me, I think you dropped this." },
  { startTime: 83, endTime: 87, text: "What is this? It looks ancient." },
  { startTime: 248, endTime: 251, text: "Of course! The North Star... it has to be the library." },
];

const MOCK_OBJECTS: TrackedObject[] = [
  { timestamp: 4, name: "Skyscraper" },
  { timestamp: 16, name: "Coffee cup" },
  { timestamp: 17, name: "Laptop" },
  { timestamp: 45, name: "Brown Package" },
  { timestamp: 84, name: "Antique Compass" },
  { timestamp: 125, name: "Sailboat" },
  { timestamp: 246, name: "Old Map" },
];

const findTabForTimestamp = (time: number, typeHint?: string): string | null => {
    const defaultChecks = [
        { tab: 'scene', check: () => MOCK_SCENES.some(s => s.timestamp === time) },
        { tab: 'transcript', check: () => MOCK_TRANSCRIPTS.some(t => time >= t.startTime && time <= t.endTime) },
        { tab: 'object', check: () => MOCK_OBJECTS.some(o => o.timestamp === time) },
    ];

    let orderedChecks = defaultChecks;

    if (typeHint) {
        const hintedCheck = defaultChecks.find(c => c.tab === typeHint);
        if (hintedCheck) {
            orderedChecks = [
                hintedCheck,
                ...defaultChecks.filter(c => c.tab !== typeHint)
            ];
        }
    }
    
    for (const { tab, check } of orderedChecks) {
        if (check()) {
            return tab;
        }
    }
    
    return null;
};


const App: React.FC = () => {
    const [isHistoryOpen, setIsHistoryOpen] = useState(true);
    const [rightPanelWidth, setRightPanelWidth] = useState(400);
    const [seekTime, setSeekTime] = useState<number | null>(null);
    const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null);
    const [activeAnalysisTab, setActiveAnalysisTab] = useState('scene');

    const toggleHistory = () => {
        setIsHistoryOpen(prev => !prev);
    };

    const jumpToTimestamp = useCallback((time: number, typeHint?: string) => {
        console.log(`Jumping to timestamp: ${time}s with hint: ${typeHint}`);
        setSeekTime(time);
        setActiveTimestamp(time);
        const targetTab = findTabForTimestamp(time, typeHint);
        if (targetTab) {
            setActiveAnalysisTab(targetTab);
        }
    }, []);

    const handleSeeked = useCallback(() => {
        setSeekTime(null);
    }, []);

    const handleVideoTimeUpdate = useCallback((time: number) => {
        // Find active transcript
        const activeTranscript = MOCK_TRANSCRIPTS.find(t => time >= t.startTime && time < t.endTime);
        if (activeTranscript) {
            setActiveTimestamp(prev => (prev !== activeTranscript.startTime ? activeTranscript.startTime : prev));
            return; // Prioritize transcript as it's most precise
        }

        // Find last active scene/object if no transcript is active
        let lastEventTimestamp: number | null = null;
        
        const allEvents = [
            ...MOCK_SCENES.map(s => s.timestamp),
            ...MOCK_OBJECTS.map(o => o.timestamp)
        ];

        for (const eventTime of allEvents) {
            if (eventTime <= time) {
                if (lastEventTimestamp === null || eventTime > lastEventTimestamp) {
                    lastEventTimestamp = eventTime;
                }
            }
        }
        
        if (lastEventTimestamp !== null) {
            setActiveTimestamp(prev => (prev !== lastEventTimestamp ? lastEventTimestamp : prev));
        }
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        document.body.style.cursor = 'col-resize';

        const startWidth = rightPanelWidth;
        const startPosition = e.clientX;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const newWidth = startWidth - (moveEvent.clientX - startPosition);
            if (newWidth > 300 && newWidth < 800) { // Min and max width constraints
                setRightPanelWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            document.body.style.cursor = 'default';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
        
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [rightPanelWidth]);


    return (
        <div className="h-screen w-screen bg-gray-50 flex flex-col">
            <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 h-[65px] flex items-center justify-between">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-300 flex items-center justify-center">
                    <LogoIcon className="text-gray-800" size={20} />
                </div>
                <button className="p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="User Login">
                    <UserIcon className="h-6 w-6 text-gray-600" />
                </button>
            </header>
            <div className="flex flex-1 overflow-hidden">
                <HistorySidebar isHistoryOpen={isHistoryOpen} toggleHistory={toggleHistory} />
                
                <VideoChatArea 
                    jumpToTimestamp={jumpToTimestamp}
                    seekTime={seekTime}
                    onSeeked={handleSeeked}
                    scenes={MOCK_SCENES}
                    transcripts={MOCK_TRANSCRIPTS}
                    objects={MOCK_OBJECTS}
                    onTimeUpdate={handleVideoTimeUpdate}
                />

                <div
                    onMouseDown={handleMouseDown}
                    className="w-1.5 cursor-col-resize bg-gray-100 hover:bg-blue-200 transition-colors flex-shrink-0"
                    title="Resize panel"
                />

                <AnalysisPanel 
                    rightPanelWidth={rightPanelWidth} 
                    scenes={MOCK_SCENES}
                    transcripts={MOCK_TRANSCRIPTS}
                    objects={MOCK_OBJECTS}
                    onTimestampClick={jumpToTimestamp}
                    activeTimestamp={activeTimestamp}
                    activeTab={activeAnalysisTab}
                    onTabChange={setActiveAnalysisTab}
                />
            </div>
        </div>
    );
};

export default App;