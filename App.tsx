import React, { useState, useCallback } from 'react';
import HistorySidebar from './components/HistorySidebar';
import AnalysisPanel from './components/AnalysisPanel';
import VideoChatArea from './components/VideoChatArea';

const App: React.FC = () => {
    const [isHistoryOpen, setIsHistoryOpen] = useState(true);
    const [rightPanelWidth, setRightPanelWidth] = useState(400);

    const toggleHistory = () => {
        setIsHistoryOpen(prev => !prev);
    };

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
            <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 h-[65px] flex items-center">
                <h1 className="text-xl font-bold text-gray-800">Vision 8</h1>
            </header>
            <div className="flex flex-1 overflow-hidden">
                <HistorySidebar isHistoryOpen={isHistoryOpen} toggleHistory={toggleHistory} />
                
                <VideoChatArea />

                <div
                    onMouseDown={handleMouseDown}
                    className="w-1.5 cursor-col-resize bg-gray-100 hover:bg-blue-200 transition-colors flex-shrink-0"
                    title="Resize panel"
                />

                <AnalysisPanel rightPanelWidth={rightPanelWidth} />
            </div>
        </div>
    );
};

export default App;